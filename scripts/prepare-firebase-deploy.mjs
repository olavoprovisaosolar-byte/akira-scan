/**
 * Prepara pacote Firebase Hosting (até ~9.2 GB — margem sobre limite 10 GB).
 * Copia site estático, catálogo completo e backup ToonLivre inteiro quando couber.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "deploy-firebase");

const SKIP_DIRS = new Set([
    "node_modules", ".git", ".playwright-browsers", "deploy-netlify", "deploy-firebase",
    "deploy-snapshot", "logs", "agent-transcripts", "terminals", "dist", "api", ".netlify"
]);

const MAX_PACKAGE_MB = 9200;
const ALWAYS_INCLUDE = new Set(["obra-69466adb"]);

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
        } else if (name !== "netlify.toml") {
            copyFile(src, path.join(OUT, name));
        }
    }
}

function copyCatalog() {
    const dataOut = path.join(OUT, "data");
    mkdirp(dataOut);
    for (const f of ["catalogo.json", "catalogo-index.json", "ingestion-status.json"]) {
        const src = path.join(ROOT, "data", f);
        if (fs.existsSync(src)) copyFile(src, path.join(dataOut, f));
    }
}

function copyMangaMetaAndCovers(srcDir, destDir, backupDir) {
    mkdirp(destDir);
    mkdirp(backupDir);

    if (fs.existsSync(path.join(srcDir, "meta.json"))) {
        copyFile(path.join(srcDir, "meta.json"), path.join(destDir, "meta.json"));
    }

    for (const f of fs.readdirSync(srcDir)) {
        if (f.startsWith("cover.")) {
            copyFile(path.join(srcDir, f), path.join(destDir, f));
            copyFile(path.join(srcDir, f), path.join(backupDir, f));
        }
    }
}

function copyBackupCoversAndChapters() {
    const srcRoot = path.join(ROOT, "data", "toonlivre-backup", "mangas");
    if (!fs.existsSync(srcRoot)) return { included: 0, skipped: 0 };

    const destData = path.join(OUT, "data", "toonlivre-backup", "mangas");
    const destBackup = path.join(OUT, "backup", "mangas");

    const chapterJobs = [];

    for (const mangaId of fs.readdirSync(srcRoot)) {
        const srcDir = path.join(srcRoot, mangaId);
        if (!fs.statSync(srcDir).isDirectory()) continue;

        copyMangaMetaAndCovers(
            srcDir,
            path.join(destData, mangaId),
            path.join(destBackup, mangaId)
        );

        const chaptersSrc = path.join(srcDir, "chapters");
        if (!fs.existsSync(chaptersSrc)) continue;

        chapterJobs.push({
            mangaId,
            chaptersSrc,
            chaptersMB: dirSizeMB(chaptersSrc),
            force: ALWAYS_INCLUDE.has(mangaId)
        });
    }

    let budgetMB = MAX_PACKAGE_MB - dirSizeMB(OUT);
    let included = 0;
    let skipped = 0;

    const forced = chapterJobs.filter((j) => j.force);
    const optional = chapterJobs.filter((j) => !j.force).sort((a, b) => a.chaptersMB - b.chaptersMB);

    for (const job of [...forced, ...optional]) {
        if (!job.force && job.chaptersMB > budgetMB) {
            skipped++;
            continue;
        }

        copyDirFiltered(job.chaptersSrc, path.join(destData, job.mangaId, "chapters"));
        included++;
        if (!job.force) budgetMB -= job.chaptersMB;
        if (included % 50 === 0) {
            console.log(`  … ${included} obras com capítulos (${budgetMB.toFixed(0)} MB restantes)`);
        }
    }

    console.log(`  Capítulos: ${included} obras incluídas, ${skipped} omitidas (orçamento)`);
    return { included, skipped };
}

function copyBiblioteca() {
    const srcRoot = path.join(ROOT, "Biblioteca_Mangas");
    const destRoot = path.join(OUT, "Biblioteca_Mangas");
    if (!fs.existsSync(srcRoot)) return;

    for (const mangaId of fs.readdirSync(srcRoot)) {
        const srcDir = path.join(srcRoot, mangaId);
        if (!fs.statSync(srcDir).isDirectory()) continue;
        copyDirFiltered(srcDir, path.join(destRoot, mangaId));
    }
}

export function prepareFirebaseDeploy() {
    console.log("=== Preparar deploy Firebase ===");
    rmrf(OUT);
    mkdirp(OUT);

    console.log("  Site estático...");
    copyStaticSite();
    console.log("  Catálogo...");
    copyCatalog();
    console.log("  Capas (383) + capítulos (orçamento ~9 GB)...");
    const stats = copyBackupCoversAndChapters();
    console.log("  Biblioteca local...");
    copyBiblioteca();

    const totalMB = dirSizeMB(OUT);
    console.log(`\n  Pacote: ${OUT}`);
    console.log(`  Tamanho: ${totalMB.toFixed(1)} MB`);

    if (totalMB > 9500) {
        console.warn("  ⚠ Próximo do limite de 10 GB — use Firebase Storage para capítulos extras.");
    } else if (stats.skipped > 0) {
        console.warn(`  ⚠ ${stats.skipped} obras sem capítulos — aumente MAX_PACKAGE_MB ou use Storage.`);
    } else {
        console.log("  ✓ Backup completo incluído no pacote.");
    }

    return { out: OUT, sizeMB: totalMB, stats };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    prepareFirebaseDeploy();
}
