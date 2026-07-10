/**
 * Reconstrói data/cloud/chapters-index.json periodicamente enquanto o upload corre.
 * Uso: node scripts/watch-rebuild-cloud-index.mjs [--every=60]
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const everySec = Math.max(30, Number(process.argv.find((a) => a.startsWith("--every="))?.split("=")[1] || 90));

function rebuild() {
    const r = spawnSync(process.execPath, [path.join(__dirname, "build-terabox-chapters-index.mjs")], {
        cwd: ROOT,
        stdio: "inherit"
    });
    console.log(`[watch] rebuild exit=${r.status} @ ${new Date().toISOString()}`);
}

console.log(`[watch] a reconstruir índice cloud a cada ${everySec}s`);
rebuild();
setInterval(rebuild, everySec * 1000);
