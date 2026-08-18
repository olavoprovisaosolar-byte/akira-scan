#!/usr/bin/env node
/**
 * Sprint 24h — máxima cobertura do catálogo NexusToons.
 * Reinicia sozinho se o processo travar ou sair com erro (retoma do state.json).
 *
 * Uso:
 *   node scripts/run-1day-sprint.mjs
 *   node scripts/run-1day-sprint.mjs --full-chapters
 *   node scripts/run-1day-sprint.mjs --shard=2/4
 *   node scripts/run-1day-sprint.mjs --background
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnWithWatchdog, runWithRestarts } from "./lib/supervised-spawn.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, "logs");
const args = process.argv.slice(2);

const FULL_CHAPTERS = args.includes("--full-chapters");
const BACKGROUND = args.includes("--background");
const SHARD = args.find((a) => a.startsWith("--shard="))?.split("=")[1]
    || process.env.NEXUSTOONS_SHARD
    || "";

const env = {
    ...process.env,
    HOSTING_ADAPTER: "catbox",
    NEXUSTOONS_HOSTING_ADAPTER: "catbox",
    TELEGRA_SKIP: "1",
    NEXUSTOONS_PURGE_LOCAL: "1",
    AKIRA_SKIP_CLOUD_PAGES: "1",
    NEXUSTOONS_BULK: "1",
    NEXUSTOONS_FULL_CATALOG: "1",
    NEXUSTOONS_USE_PLAYWRIGHT: "1",
    CATBOX_FORCE_FREEIMAGE: "1",
    CATBOX_SKIP: "true",
    LITTERBOX_SKIP: "1",
    NEXUSTOONS_DEFER_CATALOG: "1",
    NEXUSTOONS_OVERLAP_PIPELINE: "1",
    SHARP_SKIP_REENCODE: "1",
    NEXUSTOONS_PW_LITE: "1",
    NEXUSTOONS_PW_BLOCK_HEAVY: "1",
    NEXUSTOONS_MANGA_PARALLEL: process.env.NEXUSTOONS_MANGA_PARALLEL || "4",
    NEXUSTOONS_CHAPTER_CONCURRENCY: process.env.NEXUSTOONS_CHAPTER_CONCURRENCY || "8",
    NEXUSTOONS_PW_POOL_SIZE: process.env.NEXUSTOONS_PW_POOL_SIZE || "8",
    STREAM_PAGE_CONCURRENCY: process.env.STREAM_PAGE_CONCURRENCY || "80",
    STREAM_PAGE_MAX: process.env.STREAM_PAGE_MAX || "80",
    PAGE_DOWNLOAD_CONCURRENCY: process.env.PAGE_DOWNLOAD_CONCURRENCY || "80",
    NEXUSTOONS_DELAY_MS: "0",
    NEXUSTOONS_CHAPTER_DELAY_MS: "0",
    FREEIMAGE_DELAY_MS: "0",
    CATBOX_DELAY_MS: "0",
    NEXUSTOONS_PW_SETTLE_MS: process.env.NEXUSTOONS_PW_SETTLE_MS || "200",
    NEXUSTOONS_STATE_SAVE_EVERY: "10",
    PAGE_DOWNLOAD_TIMEOUT_MS: "90000",
    NEXUSTOONS_PW_CHAPTER_TIMEOUT_MS: "120000"
};

if (SHARD) env.NEXUSTOONS_SHARD = SHARD;
if (FULL_CHAPTERS) {
    env.NEXUSTOONS_ALL_CHAPTERS = "1";
} else {
    env.NEXUSTOONS_SYNC_ONLY_NEW = "1";
}

const bulkArgs = ["--all", "--full-catalog", "--no-deploy", "--hyper"];
if (FULL_CHAPTERS) bulkArgs.push("--all-chapters");
else bulkArgs.push("--latest-only");

const mode = FULL_CHAPTERS ? "FULL (todos os caps)" : "LATEST (1 cap/obra)";
const shardLabel = SHARD ? ` shard ${SHARD}` : "";

console.log("\n=== Sprint 24h NexusToons → AkiraScan ===");
console.log(`  Modo: ${mode}${shardLabel}`);
console.log(`  Mangás paralelos: ${env.NEXUSTOONS_MANGA_PARALLEL}`);
console.log(`  Caps paralelos: ${env.NEXUSTOONS_CHAPTER_CONCURRENCY}`);
console.log(`  Páginas paralelas: ${env.STREAM_PAGE_CONCURRENCY}`);
console.log("  Auto-restart: sim (watchdog + retoma state.json)\n");

if (BACKGROUND) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logPath = path.join(LOG_DIR, "sprint-1day.log");
    const out = fs.openSync(logPath, "a");
    const childArgs = args.filter((a) => a !== "--background");
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...childArgs], {
        cwd: ROOT,
        detached: true,
        stdio: ["ignore", out, out],
        env
    });
    child.unref();
    console.log(`Sprint em background (PID ${child.pid})`);
    console.log(`Log: ${logPath}`);
    process.exit(0);
}

const last = await runWithRestarts(
    (attempt) => {
        if (attempt > 1) {
            console.warn(`\n[sprint] restart #${attempt} — retoma do state.json\n`);
        }
        return spawnWithWatchdog(
            process.execPath,
            [path.join(ROOT, "scripts", "run-bulk-migration.mjs"), ...bulkArgs],
            { cwd: ROOT, env, label: "sprint-1day" }
        );
    },
    { isDone: (r) => r.code === 0 || r.code === 2 }
);

process.exit(last.code ?? 1);
