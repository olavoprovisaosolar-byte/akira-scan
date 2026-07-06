/**
 * Prepara pacote de deploy Netlify (<500 MB).
 * Mantém: site estático, catálogo, capas backup, mangás com páginas locais.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "deploy-netlify");

const SKIP_DIRS = new Set([
    "node_modules", ".git", ".playwright-browsers", "deploy-netlify",
    "deploy-snapshot", "logs", "agent-transcripts", "terminals", "dist", "api", ".netlify"
]);

const SKIP_BIBLIOTECA_MIN_MB = 80;
const MAX_BACKUP_CHAPTERS_MB = 350;
const ALWAYS_INCLUDE = new Set([
    "obra-69466adb", // A Garota do Go
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

function dirSizeBytes(dir) {
    if (!fs.existsSync(dir)) return 0;
    let total = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        total += e.isDirectory() ? dirSizeBytes(p) : fs.statSync(p).size;
    }
    return total;
}

function dirSizeMB(dir) {
    return dirSizeBytes(dir) / 1024 / 1024;
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
        if (name.startsWith(".")) continue;

        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            copyDirFiltered(src, path.join(OUT, name));
        } else {
            copyFile(src, path.join(OUT, name));
        }
    }
}

function copyCatalog() {
    const dataOut = path.join(OUT, "data");
    mkdirp(dataOut);
    for (const f of ["catalogo.json", "catalogo-index.json"]) {
        const src = path.join(ROOT, "data", f);
        if (fs.existsSync(src)) copyFile(src, path.join(dataOut, f));
    }
    const tbIdx = path.join(ROOT, "data", "terabox", "chapters-index.json");
    if (fs.existsSync(tbIdx)) {
        mkdirp(path.join(dataOut, "terabox"));
        copyFile(tbIdx, path.join(dataOut, "terabox", "chapters-index.json"));
    }
}

function copyBackupMetaCoversAndChapters() {
    const srcRoot = path.join(ROOT, "data", "toonlivre-backup", "mangas");
    const destRoot = path.join(OUT, "data", "toonlivre-backup", "mangas");
    if (!fs.existsSync(srcRoot)) return;

    let budgetMB = MAX_BACKUP_CHAPTERS_MB;

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

        const chaptersSrc = path.join(srcDir, "chapters");
        if (!fs.existsSync(chaptersSrc)) continue;

        const chaptersMB = dirSizeMB(chaptersSrc);
        const force = ALWAYS_INCLUDE.has(mangaId);
        if (!force && (chaptersMB < 0.01 || chaptersMB > SKIP_BIBLIOTECA_MIN_MB)) {
            continue;
        }
        if (!force && chaptersMB > budgetMB) continue;

        console.log(`  ✓ Backup caps ${mangaId} (${chaptersMB.toFixed(1)} MB)`);
        copyDirFiltered(chaptersSrc, path.join(destDir, "chapters"));
        if (!force) budgetMB -= chaptersMB;
    }
}

function copyBiblioteca() {
    const srcRoot = path.join(ROOT, "Biblioteca_Mangas");
    const destRoot = path.join(OUT, "Biblioteca_Mangas");
    if (!fs.existsSync(srcRoot)) return;

    for (const mangaId of fs.readdirSync(srcRoot)) {
        if (!ALWAYS_INCLUDE.has(mangaId)) continue;
        const srcDir = path.join(srcRoot, mangaId);
        if (!fs.statSync(srcDir).isDirectory()) continue;
        copyDirFiltered(srcDir, path.join(destRoot, mangaId));
    }
}

function main() {
    console.log("=== Preparar deploy Netlify ===");
    rmrf(OUT);
    mkdirp(OUT);

    console.log("  Copiando site estático...");
    copyStaticSite();
    console.log("  Copiando catálogo...");
    spawnSync(process.execPath, [path.join(__dirname, "build-terabox-chapters-index.mjs")], {
        cwd: ROOT, stdio: "inherit"
    });
    copyCatalog();
    console.log("  Copiando capas + caps backup (com orçamento)...");
    copyBackupMetaCoversAndChapters();
    console.log("  Copiando biblioteca local (≤80 MB/obras)...");
    copyBiblioteca();

    copyFile(path.join(ROOT, "netlify.toml"), path.join(OUT, "netlify.toml"));

    const totalMB = dirSizeMB(OUT);
    console.log(`\n  Pacote: ${OUT}`);
    console.log(`  Tamanho: ${totalMB.toFixed(1)} MB`);

    if (totalMB > 480) {
        console.warn("  ⚠ Pacote grande — deploy pode falhar no plano free.");
    }

    console.log("\n▶ Deploy...");
    const r = spawnSync(
        "npx",
        ["netlify", "deploy", "--prod", "--dir", OUT, "--skip-functions-cache"],
        { cwd: ROOT, stdio: "inherit", shell: true }
    );
    process.exit(r.status || 0);
}

main();
