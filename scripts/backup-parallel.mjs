/**
 * Inicia N workers de download em paralelo (shards).
 * Uso: node scripts/backup-parallel.mjs 4
 */
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs");
const workers = Math.min(8, Math.max(1, Number(process.argv[2] || 2)));

fs.mkdirSync(LOG_DIR, { recursive: true });

console.log(`=== ${workers} workers de download (turbo) ===`);
console.log("Dica: pause o upload Terabox para liberar banda.\n");

for (let i = 0; i < workers; i++) {
    const logFile = path.join(LOG_DIR, `backup-shard-${i}.log`);
    const out = fs.openSync(logFile, "a");
    const child = spawn(process.execPath, [path.join(__dirname, "backup-turbo.mjs"), `--shard=${i}/${workers}`], {
        cwd: ROOT,
        stdio: ["ignore", out, out],
        detached: true,
        env: process.env
    });
    child.unref();
    console.log(`  Worker ${i + 1}/${workers} PID ${child.pid} → logs/backup-shard-${i}.log`);
}

console.log("\nMonitorar: Get-Content logs\\backup-shard-0.log -Tail 10 -Wait");
