#!/usr/bin/env node
/**
 * Worker para segundo PC: NexusToons → Telegra.ph + sync git periódico.
 *
 * Setup (primeira vez no outro computador):
 *   npm run migrate:remote:setup
 *
 * Rodar migração:
 *   npm run migrate:remote:telegra
 *   npm run migrate:remote:telegra:turbo   # PC mais potente
 *
 * Opções:
 *   --setup          Instala deps + Playwright
 *   --pull-only      Só git pull
 *   --push-only      Só git push checkpoint
 *   --turbo          Mais rápido (mais RAM)
 *   --slug=SLUG      Um mangá só
 *   --no-sync        Sem push/pull automático
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MIGRATION_SCRIPT = path.join(__dirname, "run-bulk-migration.mjs");
const GIT_SYNC_SCRIPT = path.join(__dirname, "remote-worker-git.mjs");
const REMOTE_LOCK = path.join(ROOT, "logs", "remote-worker.lock");
const ALL_LOCK = path.join(ROOT, "logs", "migration-all.lock");

const args = process.argv.slice(2);
const SETUP = args.includes("--setup");
const PULL_ONLY = args.includes("--pull-only");
const PUSH_ONLY = args.includes("--push-only");
const NO_SYNC = args.includes("--no-sync");
const TURBO = args.includes("--turbo");
const slugIdx = args.indexOf("--slug");
const SLUG = args.find((a) => a.startsWith("--slug="))?.split("=")[1]
    || (slugIdx >= 0 ? args[slugIdx + 1] : null);

const SYNC_INTERVAL_MS = Math.max(5, Number(process.env.SYNC_INTERVAL_MINUTES || 15)) * 60 * 1000;
const WORKER_NAME = process.env.REMOTE_WORKER_NAME || os.hostname();

function log(msg) {
    console.log(`[remote-worker:${WORKER_NAME}] ${msg}`);
}

function runNode(script, scriptArgs = [], opts = {}) {
    return spawnSync(process.execPath, [script, ...scriptArgs], {
        cwd: ROOT,
        stdio: opts.silent ? "pipe" : "inherit",
        env: { ...process.env, ...opts.env }
    });
}

function applyTelegraWorkerEnv() {
    process.env.TELEGRA_SKIP = "0";
    process.env.HOSTING_ADAPTER = "telegra";
    process.env.NEXUSTOONS_HOSTING_ADAPTER = "telegra";
    process.env.TELEGRA_STATIC_FALLBACK = process.env.TELEGRA_STATIC_FALLBACK || "true";
    process.env.TELEGRA_DELAY_MS = process.env.TELEGRA_DELAY_MS || "600";
    process.env.TELEGRA_RETRIES = process.env.TELEGRA_RETRIES || "3";
    process.env.NEXUSTOONS_USE_PLAYWRIGHT = "1";
    process.env.STREAM_PAGE_CONCURRENCY = process.env.STREAM_PAGE_CONCURRENCY || "2";
}

function setup() {
    log("=== Setup worker remoto Telegra ===");
    const nodeV = process.version;
    log(`Node ${nodeV}`);
    if (Number(process.version.slice(1).split(".")[0]) < 20) {
        console.error("Requer Node.js >= 20");
        process.exit(1);
    }

    log("npm ci…");
    const ci = spawnSync("npm", ["ci"], { cwd: ROOT, stdio: "inherit", shell: true });
    if (ci.status !== 0) {
        log("npm ci falhou — tentando npm install…");
        spawnSync("npm", ["install"], { cwd: ROOT, stdio: "inherit", shell: true });
    }

    log("Playwright Chromium…");
    spawnSync("npx", ["playwright", "install", "chromium"], { cwd: ROOT, stdio: "inherit", shell: true });

    const envExample = path.join(ROOT, ".env.remote-worker.example");
    const envTarget = path.join(ROOT, ".env");
    if (fs.existsSync(envExample) && !fs.existsSync(envTarget)) {
        fs.copyFileSync(envExample, envTarget);
        log("Criado .env a partir de .env.remote-worker.example — revise antes de rodar.");
    }

    log("Setup concluído. Próximo: npm run migrate:remote:telegra");
}

function gitSync(op, label) {
    if (NO_SYNC) return Promise.resolve();
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [GIT_SYNC_SCRIPT, op, `--label=${label}`], {
            cwd: ROOT,
            env: {
                ...process.env,
                REMOTE_WORKER_NAME: WORKER_NAME,
                GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || WORKER_NAME,
                GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || `${WORKER_NAME}@local`
            },
            stdio: "inherit"
        });
        child.on("close", () => resolve());
    });
}

function readLock(file) {
    try {
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

function isPidAlive(pid) {
    if (!pid || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function warnOtherMachine() {
    const all = readLock(ALL_LOCK);
    if (all?.pid && isPidAlive(all.pid) && all.pid !== process.pid) {
        log(`AVISO: migração ativa no PID ${all.pid} (outro PC ou sessão?).`);
        log("Pare a migração lá antes de continuar, ou use migrate:handoff:cloud.");
    }
}

function acquireRemoteLock() {
    fs.mkdirSync(path.dirname(REMOTE_LOCK), { recursive: true });
    const payload = {
        pid: process.pid,
        worker: WORKER_NAME,
        startedAt: new Date().toISOString(),
        mode: TURBO ? "turbo" : "lite"
    };
    fs.writeFileSync(REMOTE_LOCK, JSON.stringify(payload, null, 2));
    const release = () => {
        try {
            const cur = readLock(REMOTE_LOCK);
            if (cur?.pid === process.pid) fs.unlinkSync(REMOTE_LOCK);
        } catch { /* ignore */ }
    };
    process.on("exit", release);
    for (const sig of ["SIGINT", "SIGTERM"]) {
        process.on(sig, () => {
            release();
            process.exit(sig === "SIGINT" ? 130 : 143);
        });
    }
}

function runMigration() {
    applyTelegraWorkerEnv();
    const migArgs = [MIGRATION_SCRIPT];
    if (SLUG) migArgs.push(`--slug=${SLUG}`);
    else migArgs.push("--all");
    migArgs.push(TURBO ? "--turbo" : "--lite", "--no-deploy");

    log(`Iniciando: node ${path.basename(MIGRATION_SCRIPT)} ${migArgs.slice(1).join(" ")}`);

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

if (SETUP) {
    setup();
    process.exit(0);
}

if (PULL_ONLY) {
    runNode(GIT_SYNC_SCRIPT, ["pull"]).status === 0 || process.exit(1);
    process.exit(0);
}

if (PUSH_ONLY) {
    runNode(GIT_SYNC_SCRIPT, ["push", "--label=manual"]).status === 0 || process.exit(1);
    process.exit(0);
}

async function main() {
    log("=== Worker remoto Telegra (NexusToons → Telegra.ph) ===");
    applyTelegraWorkerEnv();
    acquireRemoteLock();
    warnOtherMachine();

    if (!NO_SYNC) {
        log("Sincronizando estado do GitHub (pull)…");
        await gitSync("pull", "start");
    }

    let syncTimer = null;
    let syncCount = 0;
    if (!NO_SYNC) {
        syncTimer = setInterval(async () => {
            syncCount++;
            log(`Sync periódico #${syncCount} (push)…`);
            await gitSync("push", `periodic-${syncCount}`);
            await gitSync("pull", `after-push-${syncCount}`);
        }, SYNC_INTERVAL_MS);
    }

    try {
        await runMigration();
        log("Migração concluída neste PC.");
        if (!NO_SYNC) await gitSync("push", "final");
    } catch (e) {
        log(`Erro: ${e.message}`);
        if (!NO_SYNC) await gitSync("push", "error-recovery");
        process.exit(1);
    } finally {
        if (syncTimer) clearInterval(syncTimer);
    }

    log("Concluído. Outro PC pode dar git pull para ver o progresso.");
}

main();
