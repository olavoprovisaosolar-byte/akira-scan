/**
 * Prepara pacote estático para GitHub Pages (sem Netlify Functions).
 * Inclui catálogo, índice Terabox, capas backup — capítulos via Terabox/dlinks.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "deploy-github");

const SKIP_DIRS = new Set([
    "node_modules", ".git", ".playwright-browsers", "deploy-netlify",
    "deploy-github", "deploy-firebase", "deploy-snapshot", "logs",
    "agent-transcripts", "terminals", "dist", "api", ".netlify"
]);

function rmrf(p) {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
    fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
    mkdirp(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

function copyDirFiltered(src, dest, filter) {
    if (!fs.existsSync(src)) return;
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, e.name);
        const to = path.join(dest, e.name);
        if (e.isDirectory()) {
            if (filter?.(from, e.name, true) === false) continue;
            copyDirFiltered(from, to, filter);
        } else {
            if (filter?.(from, e.name, false) === false) continue;
            copyFile(from, to);
        }
    }
}

function repoBasePath() {
    const env = process.env.GITHUB_PAGES_BASE?.trim();
    if (env) return env.endsWith("/") ? env : `${env}/`;
    const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
    if (repo) return `/${repo}/`;
    return "/";
}

function injectBaseHref(htmlPath, basePath) {
    let html = fs.readFileSync(htmlPath, "utf8");
    if (html.includes("<base ")) return;
    html = html.replace("<head>", `<head>\n    <base href="${basePath}">`);
    fs.writeFileSync(htmlPath, html, "utf8");
}

function copyStaticSite(basePath) {
    for (const name of fs.readdirSync(ROOT)) {
        const src = path.join(ROOT, name);
        if (SKIP_DIRS.has(name)) continue;
        if (name === "data") continue;
        if (name === "Biblioteca_Mangas") continue;
        if (name.startsWith(".")) continue;

        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            copyDirFiltered(src, path.join(OUT, name));
        } else {
            copyFile(src, path.join(OUT, name));
        }
    }

    for (const html of fs.readdirSync(OUT).filter((f) => f.endsWith(".html"))) {
        injectBaseHref(path.join(OUT, html), basePath);
    }

    copyFile(path.join(OUT, "index.html"), path.join(OUT, "404.html"));
    fs.writeFileSync(path.join(OUT, ".nojekyll"), "", "utf8");
}

function copyData() {
    const dataOut = path.join(OUT, "data");
    mkdirp(dataOut);
    for (const f of ["catalogo.json", "catalogo-index.json"]) {
        const src = path.join(ROOT, "data", f);
        if (fs.existsSync(src)) copyFile(src, path.join(dataOut, f));
    }

    const tbDir = path.join(ROOT, "data", "terabox");
    const tbOut = path.join(dataOut, "terabox");
    mkdirp(tbOut);
    for (const f of ["chapters-index.json", "mangas-cache.json"]) {
        const src = path.join(tbDir, f);
        if (fs.existsSync(src)) copyFile(src, path.join(tbOut, f));
    }
}

function copyBackupCovers() {
    const srcRoot = path.join(ROOT, "data", "toonlivre-backup", "mangas");
    const destRoot = path.join(OUT, "data", "toonlivre-backup", "mangas");
    if (!fs.existsSync(srcRoot)) return;

    for (const mangaId of fs.readdirSync(srcRoot)) {
        const srcDir = path.join(srcRoot, mangaId);
        if (!fs.statSync(srcDir).isDirectory()) continue;
        const destDir = path.join(destRoot, mangaId);
        mkdirp(destDir);
        if (fs.existsSync(path.join(srcDir, "meta.json"))) {
            copyFile(path.join(srcDir, "meta.json"), path.join(destDir, "meta.json"));
        }
        for (const f of fs.readdirSync(srcDir)) {
            if (f.startsWith("cover.")) {
                copyFile(path.join(srcDir, f), path.join(destDir, f));
            }
        }
    }
}

function writeSiteConfig(basePath) {
    /* site-config.js auto-detecta GitHub Pages em runtime — não sobrescrever no repo local */
    void basePath;
}

function main() {
    console.log("=== Preparar deploy GitHub Pages ===");
    const basePath = repoBasePath();
    console.log(`  Base path: ${basePath || "/"}`);

    console.log("  Build catálogo + índice Terabox...");
    spawnSync(process.execPath, [path.join(__dirname, "build-catalog-index.mjs")], {
        cwd: ROOT, stdio: "inherit"
    });
    if (fs.existsSync(path.join(ROOT, "data", "terabox", "upload-state.json"))) {
        spawnSync(process.execPath, [path.join(__dirname, "build-terabox-chapters-index.mjs")], {
            cwd: ROOT, stdio: "inherit"
        });
    } else if (fs.existsSync(path.join(ROOT, "data", "terabox", "chapters-index.json"))) {
        console.log("  Índice Terabox: usando chapters-index.json existente");
    }

    rmrf(OUT);
    mkdirp(OUT);

    writeSiteConfig(basePath);
    console.log("  Copiando site estático...");
    copyStaticSite(basePath);
    console.log("  Copiando catálogo + Terabox...");
    copyData();
    console.log("  Copiando capas backup...");
    copyBackupCovers();

    const totalMB = fs.readdirSync(OUT).reduce((acc, name) => {
        const p = path.join(OUT, name);
        const st = fs.statSync(p);
        return acc + (st.isFile() ? st.size : 0);
    }, 0) / 1024 / 1024;

    console.log(`\n  Pacote: ${OUT}`);
    console.log(`  Publique a pasta deploy-github no GitHub Pages`);
    console.log(`  npm run deploy:github  (ou push via Actions)`);
}

main();
