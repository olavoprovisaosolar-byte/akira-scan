/**
 * Converte capas JPG/PNG para WebP (menor peso no Hosting).
 * Requer: npm i -D sharp  (opcional — instala só se executar)
 *
 * Uso: node scripts/convert-images-webp.mjs [--dry-run]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DRY = process.argv.includes("--dry-run");

const TARGET_DIRS = [
    path.join(ROOT, "data", "toonlivre-backup", "mangas"),
    path.join(ROOT, "Biblioteca_Mangas")
];

async function loadSharp() {
    try {
        return (await import("sharp")).default;
    } catch {
        console.error("Instale sharp: npm i -D sharp");
        process.exit(1);
    }
}

function walk(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (/\.(jpe?g|png)$/i.test(e.name)) acc.push(p);
    }
    return acc;
}

async function main() {
    const sharp = await loadSharp();
    let converted = 0;
    let savedBytes = 0;

    for (const base of TARGET_DIRS) {
        for (const file of walk(base)) {
            const out = file.replace(/\.(jpe?g|png)$/i, ".webp");
            if (fs.existsSync(out)) continue;

            const before = fs.statSync(file).size;
            if (DRY) {
                console.log(`[dry] ${file} → ${out}`);
                continue;
            }

            await sharp(file).webp({ quality: 82 }).toFile(out);
            const after = fs.statSync(out).size;
            converted++;
            savedBytes += Math.max(0, before - after);
            console.log(`  ✓ ${path.relative(ROOT, out)} (−${((before - after) / 1024).toFixed(0)} KB)`);
        }
    }

    console.log(`\nConvertidas: ${converted} | Economia: ${(savedBytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
