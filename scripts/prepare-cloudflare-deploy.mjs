/**
 * Prepara pacote estático para Cloudflare Pages.
 * Capítulos (imagens + índice) ficam na API R2 — não no deploy estático.
 * API /api/cloud/* fica em functions/ na raiz do repo (Pages Functions).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "deploy-cloudflare");

const SKIP_DIRS = new Set([
    "node_modules", ".git", ".playwright-browsers", "deploy-netlify",
    "deploy-github", "deploy-firebase", "deploy-cloudflare", "deploy-snapshot",
    "logs", "agent-transcripts", "terminals", "dist", "api", ".netlify", "functions"
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

function copyStaticSite() {
    for (const name of fs.readdirSync(ROOT)) {
        const src = path.join(ROOT, name);
        if (SKIP_DIRS.has(name)) continue;
        if (name === "data") continue;
        if (name === "Biblioteca_Mangas") continue;
        if (name === "terabox.html") continue;
        if (name === "configurar-firebase.html") continue;
        if (name === "dev") continue;
        if (name.startsWith(".")) continue;

        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            copyDirFiltered(src, path.join(OUT, name));
        } else {
            copyFile(src, path.join(OUT, name));
        }
    }

    copyFile(path.join(OUT, "index.html"), path.join(OUT, "404.html"));
}

function copyData() {
    const dataOut = path.join(OUT, "data");
    mkdirp(dataOut);
    for (const f of ["catalogo.json", "catalogo-index.json"]) {
        const src = path.join(ROOT, "data", f);
        if (fs.existsSync(src)) copyFile(src, path.join(dataOut, f));
    }

    // Capítulos e imagens ficam na API (R2) — não no pacote estático Pages.
    console.log("  Cloud: índice + páginas servidos via /api/cloud/* (R2)");
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

function writeCloudflareMeta() {
    fs.writeFileSync(path.join(OUT, "_redirects"), [
        "/biblioteca/*  /data/toonlivre-backup/:splat  200",
        "/backup/*  /data/toonlivre-backup/:splat  200",
        "/*  /index.html  200"
    ].join("\n") + "\n", "utf8");

    fs.writeFileSync(path.join(OUT, "_headers"), [
        "/data/catalogo*.json",
        "  Cache-Control: public, max-age=120, stale-while-revalidate=600",
        "",
        "/data/toonlivre-backup/*",
        "  Cache-Control: public, max-age=86400"
    ].join("\n") + "\n", "utf8");

    fs.writeFileSync(path.join(OUT, "js", "host-env.js"), [
        "/** Gerado por prepare-cloudflare-deploy — identifica hospedagem Cloudflare */",
        "window.__AKIRA_HOST__ = \"cloudflare-pages\";",
        ""
    ].join("\n"), "utf8");
}

function injectHostEnvScript() {
    const marker = 'src="js/host-env.js"';
    for (const html of fs.readdirSync(OUT).filter((f) => f.endsWith(".html"))) {
        const p = path.join(OUT, html);
        let content = fs.readFileSync(p, "utf8");
        if (content.includes(marker)) continue;
        content = content.replace(
            "</head>",
            '    <script src="js/host-env.js"></script>\n</head>'
        );
        fs.writeFileSync(p, content, "utf8");
    }
}

function main() {
    console.log("=== Preparar deploy Cloudflare Pages ===");

    console.log("  Build catálogo...");
    spawnSync(process.execPath, [path.join(__dirname, "build-catalog-index.mjs")], {
        cwd: ROOT, stdio: "inherit"
    });

    rmrf(OUT);
    mkdirp(OUT);

    console.log("  Copiando site estático...");
    copyStaticSite();
    console.log("  Copiando catálogo (metadados)...");
    copyData();
    console.log("  Copiando capas backup...");
    copyBackupCovers();
    writeCloudflareMeta();
    injectHostEnvScript();

    console.log(`\n  Pacote: ${OUT}`);
    console.log("  Functions: ./functions (Pages Functions na raiz do repo)");
    console.log("  Deploy: npm run deploy:cloudflare");
}

main();
