/**
 * Pipeline: baixa capítulos (ToonLivre) + envia para Terabox em paralelo.
 *   npm run terabox:pipeline
 */
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const LOG_DIR = path.join(ROOT, "logs");

fs.mkdirSync(LOG_DIR, { recursive: true });

function iniciar(nome, script, logFile) {
    const out = fs.openSync(logFile, "a");
    const child = spawn(process.execPath, [path.join(ROOT, script)], {
        cwd: ROOT,
        stdio: ["ignore", out, out],
        detached: true,
        env: process.env
    });
    child.unref();
    console.log(`✓ ${nome} (PID ${child.pid}) → ${logFile}`);
    return child.pid;
}

console.log("=== Pipeline Akira: download + Terabox ===");
iniciar("Download capítulos", "scripts/backup-toonlivre-complete.mjs", path.join(LOG_DIR, "backup-complete-run.log"));
iniciar("Upload Terabox", "scripts/terabox/upload-all.mjs", path.join(LOG_DIR, "terabox-upload.log"));
console.log("\nMonitorar:");
console.log("  Get-Content logs\\backup-complete-run.log -Tail 10 -Wait");
console.log("  Get-Content logs\\terabox-upload.log -Tail 10 -Wait");
