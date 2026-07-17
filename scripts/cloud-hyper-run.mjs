/**
 * Migração hyper/ultra na nuvem (GitHub Actions ou VPS) com checkpoint git periódico.
 *
 * Uso:
 *   node scripts/cloud-hyper-run.mjs --all --hyper
 *   node scripts/cloud-hyper-run.mjs --slug=meu-manga --hyper
 *   SYNC_INTERVAL_MINUTES=20 node scripts/cloud-hyper-run.mjs --all --hyper --no-deploy
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MIGRATION_SCRIPT = path.join(__dirname, "run-bulk-migration.mjs");

const SYNC_INTERVAL_MS = Math.max(5, Number(process.env.SYNC_INTERVAL_MINUTES || 15)) * 60 * 1000;
const SKIP_GIT_SYNC = process.env.SKIP_GIT_SYNC === "1" || process.env.GITHUB_ACTIONS !== "true";

const CHECKPOINT_PATHS = [
    "data/nexustoons/state.json",
    "data/nexustoons/manifest.json",
    "data/catalogo.json",
    "data/catalogo-index.json",
    "data/cloud/chapters-index.json"
];

function log(msg) {
    console.log(`[cloud-hyper] ${msg}`);
}

function gitSync(label) {
    if (SKIP_GIT_SYNC) return;
    const existing = CHECKPOINT_PATHS.filter((p) => fs.existsSync(path.join(ROOT, p)));
    if (!existing.length) return;

    const addList = existing.map((p) => `"${p}"`).join(" ");
    const ts = new Date().toISOString().slice(0, 16);
    const msg = `bot(migrate): checkpoint ${label} ${ts}`;

    return new Promise((resolve) => {
        const sh = spawn("bash", ["-c", `
            git config user.name "github-actions[bot]" || true
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com" || true
            git add ${addList} 2>/dev/null || true
            git diff --staged --quiet || git commit -m "${msg}"
            git pull --rebase origin "$(git rev-parse --abbrev-ref HEAD)" || true
            git push || true
        `], { cwd: ROOT, stdio: "inherit" });
        sh.on("close", () => resolve());
    });
}

async function runMigration(extraArgs) {
    const migArgs = [MIGRATION_SCRIPT, ...extraArgs, "--ci"];
    log(`Iniciando: node ${path.basename(MIGRATION_SCRIPT)} ${extraArgs.join(" ")} --ci`);

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, migArgs, {
            cwd: ROOT,
            env: { ...process.env },
            stdio: "inherit"
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) reject(new Error(`Migração falhou (código ${code})`));
            else resolve();
        });
    });
}

const rawArgs = process.argv.slice(2);
const migArgs = rawArgs.filter((a) => a !== "--no-git-sync");

if (!migArgs.some((a) => a.startsWith("--slug=") || a === "--slug" || a === "--all")) {
    console.error("Uso: node scripts/cloud-hyper-run.mjs (--all | --slug=SLUG) [--hyper|--ultra] [--no-deploy]");
    process.exit(1);
}

let syncTimer = null;
let syncCount = 0;

if (!SKIP_GIT_SYNC) {
    syncTimer = setInterval(async () => {
        syncCount++;
        log(`Sync periódico #${syncCount}…`);
        await gitSync(`periodic-${syncCount}`);
    }, SYNC_INTERVAL_MS);
}

try {
    await runMigration(migArgs);
    log("Migração concluída.");
    if (!SKIP_GIT_SYNC) {
        await gitSync("final");
    }
} catch (e) {
    log(`Erro: ${e.message}`);
    if (!SKIP_GIT_SYNC) {
        await gitSync("error-recovery");
    }
    process.exit(1);
} finally {
    if (syncTimer) clearInterval(syncTimer);
}
