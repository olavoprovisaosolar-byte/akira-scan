#!/usr/bin/env node
/**
 * Para migração hyper local com segurança e prepara handoff para GitHub Actions / VPS.
 *
 * Uso:
 *   node scripts/handoff-migration-to-cloud.mjs
 *   node scripts/handoff-migration-to-cloud.mjs --push
 *   node scripts/handoff-migration-to-cloud.mjs --force
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOCK_PATH = path.join(ROOT, "logs", "migration-all.lock");
const STATE_PATH = path.join(ROOT, "data", "nexustoons", "state.json");

const args = process.argv.slice(2);
const DO_PUSH = args.includes("--push");
const FORCE = args.includes("--force");

function readLock() {
    try {
        if (!fs.existsSync(LOCK_PATH)) return null;
        return JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
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

function stopPid(pid) {
    const isWin = process.platform === "win32";
    if (isWin) {
        const taskkillArgs = ["/PID", String(pid), "/T"];
        if (FORCE) taskkillArgs.push("/F");
        const r = spawnSync("taskkill", taskkillArgs, { encoding: "utf8", shell: true });
        return r.status === 0;
    }
    try {
        process.kill(pid, FORCE ? "SIGKILL" : "SIGTERM");
        return true;
    } catch {
        return false;
    }
}

function sleepMs(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* sync wait */ }
}

function waitForExit(pid, maxMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
        if (!isPidAlive(pid)) return true;
        sleepMs(2000);
    }
    return !isPidAlive(pid);
}

function countProcessed() {
    if (!fs.existsSync(STATE_PATH)) return 0;
    try {
        const st = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
        return Object.keys(st.processed || {}).length;
    } catch {
        return 0;
    }
}

console.log("=== Handoff: migração local → nuvem (hyper) ===\n");

const lock = readLock();
if (lock?.pid && isPidAlive(lock.pid)) {
    console.log(`Migração local ativa: PID ${lock.pid} (desde ${lock.startedAt || "?"})`);
    console.log(FORCE ? "Encerrando com força…" : "Enviando sinal de parada (SIGTERM/taskkill)…");
    stopPid(lock.pid);
    const stopped = waitForExit(lock.pid, FORCE ? 5000 : 45000);
    if (!stopped && !FORCE) {
        console.error("\nProcesso ainda ativo. Rode novamente com --force para matar.");
        process.exit(1);
    }
    if (fs.existsSync(LOCK_PATH)) {
        try { fs.unlinkSync(LOCK_PATH); } catch { /* ignore */ }
    }
    console.log("Processo local encerrado.\n");
} else {
    console.log("Nenhuma migração --all ativa (lock ausente ou PID morto).\n");
    if (fs.existsSync(LOCK_PATH)) {
        try { fs.unlinkSync(LOCK_PATH); } catch { /* ignore */ }
    }
}

const caps = countProcessed();
console.log(`Checkpoint state.json: ${caps} capítulo(s) processado(s).`);

const checkpointFiles = [
    "data/nexustoons/state.json",
    "data/nexustoons/manifest.json",
    "data/catalogo.json",
    "data/catalogo-index.json",
    "data/cloud/chapters-index.json"
];

spawnSync("git", ["add", ...checkpointFiles.filter((f) => fs.existsSync(path.join(ROOT, f)))], { cwd: ROOT, stdio: "inherit" });

const status = spawnSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" });
if (status.stdout?.trim()) {
    console.log("\nAlterações prontas para commit:");
    console.log(status.stdout);
    const commit = spawnSync("git", ["commit", "-m", "chore(migrate): handoff local→cloud checkpoint"], { cwd: ROOT, encoding: "utf8" });
    if (commit.status !== 0 && !commit.stdout?.includes("nothing to commit")) {
        console.warn("Commit manual pode ser necessário.");
    } else {
        console.log("Commit de checkpoint criado.");
    }
} else {
    console.log("\nNenhuma alteração pendente nos arquivos de checkpoint.");
}

if (DO_PUSH) {
    console.log("\nEnviando para origin…");
    const push = spawnSync("git", ["push"], { cwd: ROOT, stdio: "inherit" });
    if (push.status !== 0) {
        console.error("Push falhou — verifique credenciais git.");
        process.exit(1);
    }
    console.log("Push OK.");
}

console.log(`
Próximos passos (GitHub Actions — hyper na nuvem, 0 RAM local):

  1. ${DO_PUSH ? "✓ Push feito" : "git push origin main"}
  2. GitHub → Actions → "Migrate Bulk Hyper (Cloud)" → Run workflow
  3. mode: hyper | slug: (vazio = todos pendentes) | deploy: true
  4. Acompanhe logs; state.json é commitado a cada ~15 min
  5. Se o job expirar (6h), rode de novo — retoma do state.json

Secrets necessários (Settings → Secrets):
  CLOUDFLARE_API_TOKEN  — deploy final Cloudflare Pages (opcional se deploy=false)

Tempo estimado: ~2–4 h (mesmo hyper local)
Custo: ~2–4 h de GitHub Actions (2000 min/mês free tier em repos privados; ilimitado em públicos)
`);
