/**
 * Modo turbo — reinicia backup com env otimizado.
 *   node scripts/backup-turbo.mjs --sync-new   # só caps novos (não PC, não Terabox)
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const shardArg = process.argv.find((a) => a.startsWith("--shard="));
const [shardIndex = "0", shardTotal = "1"] = (shardArg?.split("=")[1] || "").split("/");

const env = {
    ...process.env,
    BACKUP_DELAY_MS: process.env.BACKUP_DELAY_MS || "200",
    BACKUP_PAGE_CONCURRENCY: process.env.BACKUP_PAGE_CONCURRENCY || "8",
    BACKUP_PW_SETTLE_MS: process.env.BACKUP_PW_SETTLE_MS || "1200",
    BACKUP_PW_GOTO_WAIT: process.env.BACKUP_PW_GOTO_WAIT || "domcontentloaded",
    BACKUP_SHARD_INDEX: process.env.BACKUP_SHARD_INDEX || shardIndex,
    BACKUP_SHARD_TOTAL: process.env.BACKUP_SHARD_TOTAL || shardTotal
};

console.log("=== Backup TURBO ===");
console.log(`  delay=${env.BACKUP_DELAY_MS}ms | páginas=${env.BACKUP_PAGE_CONCURRENCY}x | shard=${env.BACKUP_SHARD_INDEX}/${env.BACKUP_SHARD_TOTAL}`);

const child = spawn(process.execPath, [path.join(__dirname, "backup-toonlivre-complete.mjs"), ...process.argv.filter((a) => !a.startsWith("--shard="))], {
    cwd: ROOT,
    stdio: "inherit",
    env
});

child.on("exit", (code) => process.exit(code ?? 0));
