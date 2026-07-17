/**
 * Migração hyper/ultra na nuvem — loop contínuo até fila vazia ou tempo máximo.
 *
 * Uso:
 *   node scripts/cloud-hyper-run.mjs --all --hyper
 *   MIGRATE_LOOP=1 node scripts/cloud-hyper-run.mjs --all --hyper
 *   SYNC_INTERVAL_MINUTES=120 node scripts/cloud-hyper-run.mjs --all --hyper --no-deploy
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MIGRATION_SCRIPT = path.join(__dirname, "run-bulk-migration.mjs");
const PENDING_SCRIPT = path.join(__dirname, "check-migrate-pending.mjs");

const SYNC_INTERVAL_MS = Math.max(10, Number(process.env.SYNC_INTERVAL_MINUTES || 120)) * 60 * 1000;
const SKIP_GIT_SYNC = process.env.SKIP_GIT_SYNC === "1" || process.env.GITHUB_ACTIONS !== "true";
const LOOP_ENABLED = process.env.MIGRATE_LOOP !== "0";
const MAX_LOOP_MS = Number(process.env.MIGRATE_LOOP_MAX_MS || 5.4 * 60 * 60 * 1000);

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
    if (SKIP_GIT_SYNC) return Promise.resolve();
    const existing = CHECKPOINT_PATHS.filter((p) => fs.existsSync(path.join(ROOT, p)));
    if (!existing.length) return Promise.resolve();

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

function gitSyncBackground(label) {
    if (SKIP_GIT_SYNC) return;
    gitSync(label).catch((e) => log(`git sync (${label}): ${e.message}`));
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
            if (code === 0) resolve("done");
            else if (code === 2) resolve("empty");
            else reject(new Error(`Migração falhou (código ${code})`));
        });
    });
}

async function hasPendingWork() {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [PENDING_SCRIPT], {
            cwd: ROOT,
            env: { ...process.env },
            stdio: ["ignore", "pipe", "inherit"]
        });
        let out = "";
        child.stdout?.on("data", (d) => { out += d; });
        child.on("close", (code) => {
            try {
                const data = JSON.parse(out.trim().split("\n").pop() || "{}");
                resolve({ pending: data.pending ?? 0, code });
            } catch {
                resolve({ pending: code === 0 ? 1 : 0, code });
            }
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
    syncTimer = setInterval(() => {
        syncCount++;
        log(`Sync periódico #${syncCount} (background)…`);
        gitSyncBackground(`periodic-${syncCount}`);
    }, SYNC_INTERVAL_MS);
}

const started = Date.now();
let round = 0;
let lastResult = "done";

try {
    do {
        round++;
        log(`=== Rodada ${round} ===`);
        lastResult = await runMigration(migArgs);

        if (lastResult === "empty") {
            log("Fila vazia nesta rodada.");
            break;
        }

        if (!LOOP_ENABLED) break;

        const { pending } = await hasPendingWork();
        if (pending <= 0) {
            log("Nenhum mangá pendente — concluído.");
            break;
        }

        log(`${pending} mangá(s) ainda pendentes — próxima rodada…`);
        await gitSync(`round-${round}`);

        if (Date.now() - started >= MAX_LOOP_MS) {
            log("Tempo máximo de loop atingido — checkpoint final.");
            break;
        }
    } while (LOOP_ENABLED);

    log(`Migração concluída após ${round} rodada(s).`);
    await gitSync("final");
} catch (e) {
    log(`Erro: ${e.message}`);
    await gitSync("error-recovery");
    process.exit(1);
} finally {
    if (syncTimer) clearInterval(syncTimer);
}
