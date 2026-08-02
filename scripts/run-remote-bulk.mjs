#!/usr/bin/env node
/**
 * Bulk NexusToons em modo remoto — imagens vão para Catbox, não ficam no disco.
 *
 * O PC guarda só JSON (índice + catálogo). Após cada capítulo, apaga temp local.
 * Sync do índice para o site via AKIRA_PUBLISH_TOKEN → PUT /api/cloud/index/chapter
 *
 * Uso:
 *   npm run bot:nexustoons:bulk:remote -- --all
 *   npm run bot:nexustoons:bulk:remote -- --slug=meu-manga
 *   npm run bot:nexustoons:bulk:remote -- --all --no-deploy
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const env = {
    ...process.env,
    HOSTING_ADAPTER: "catbox",
    NEXUSTOONS_HOSTING_ADAPTER: "catbox",
    CATBOX_STATIC_FALLBACK: "false",
    TELEGRA_SKIP: "1",
    NEXUSTOONS_PURGE_LOCAL: "1",
    AKIRA_SKIP_CLOUD_PAGES: "1",
    NEXUSTOONS_BULK: "1"
};

if (!env.AKIRA_PUBLISH_TOKEN) {
    console.warn("[AVISO] AKIRA_PUBLISH_TOKEN não definido — índice só local até deploy/git.");
    console.warn("        Defina no .env para caps aparecerem no site imediatamente.\n");
}

console.log("[remote-bulk] Modo: Catbox (sem disco local) | purge=1 | fallback=off");
console.log(`[remote-bulk] Args: ${args.join(" ") || "(nenhum — use --all ou --slug=...)"}\n`);

const r = spawnSync(
    process.execPath,
    ["bots/nexustoons-akira/orchestrator/bulk-run.mjs", ...args],
    { cwd: ROOT, env, stdio: "inherit", shell: false }
);

process.exit(r.status ?? 1);
