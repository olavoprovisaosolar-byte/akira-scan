/**
 * Reconstrói catálogo a partir do backup local ToonLivre.
 * Uso: node scripts/rebuild-from-backup.mjs
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function run(script) {
    console.log(`\n▶ ${script}`);
    const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
        cwd: ROOT,
        stdio: "inherit"
    });
    if (r.status !== 0) process.exit(r.status || 1);
}

console.log("=== Rebuild AkiraScan a partir do backup ===");
run("import-toonlivre-backup.mjs");
run("build-catalog-index.mjs");
console.log("\n✓ Catálogo e índice reconstruídos. Reinicie o servidor (npm run dev:legacy).");
