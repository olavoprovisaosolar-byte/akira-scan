#!/usr/bin/env node
/**
 * Mantém o upload Nexus→Akira vivo no PC (reinicia sozinho se travar/falhar).
 *
 * Uso:
 *   node scripts/keep-upload-alive.mjs
 *   node scripts/keep-upload-alive.mjs --full-chapters
 *   node scripts/keep-upload-alive.mjs --background
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWithRestarts, spawnWithWatchdog } from "./lib/supervised-spawn.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = path.join(ROOT, "logs");
const args = process.argv.slice(2);
const BACKGROUND = args.includes("--background");
const FULL = args.includes("--full-chapters") || args.includes("--all-chapters");

const childArgs = [
    path.join(ROOT, "scripts", "run-bulk-migration.mjs"),
    "--all",
    "--full-catalog",
    "--hyper",
    "--no-deploy"
];
if (FULL) childArgs.push("--all-chapters");
else childArgs.push("--latest-only");

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
    CATBOX_FORCE_FREEIMAGE: process.env.CATBOX_FORCE_FREEIMAGE || "1",
    CATBOX_SKIP: process.env.CATBOX_SKIP || "true",
    LITTERBOX_SKIP: "1",
    NEXUSTOONS_DEFER_CATALOG: "1",
    NEXUSTOONS_OVERLAP_PIPELINE: "1",
    SHARP_SKIP_REENCODE: "1",
    NEXUSTOONS_PW_LITE: "1",
    NEXUSTOONS_PW_BLOCK_HEAVY: "1",
    NEXUSTOONS_MANGA_PARALLEL: process.env.NEXUSTOONS_MANGA_PARALLEL || "2",
    NEXUSTOONS_CHAPTER_CONCURRENCY: process.env.NEXUSTOONS_CHAPTER_CONCURRENCY || "4",
    NEXUSTOONS_PW_POOL_SIZE: process.env.NEXUSTOONS_PW_POOL_SIZE || "4",
    STREAM_PAGE_CONCURRENCY: process.env.STREAM_PAGE_CONCURRENCY || "24",
    STREAM_PAGE_MAX: process.env.STREAM_PAGE_MAX || "24",
    PAGE_DOWNLOAD_CONCURRENCY: process.env.PAGE_DOWNLOAD_CONCURRENCY || "24",
    NEXUSTOONS_DELAY_MS: "0",
    NEXUSTOONS_CHAPTER_DELAY_MS: "0",
    FREEIMAGE_DELAY_MS: "0",
    UPLOAD_STALL_MS: process.env.UPLOAD_STALL_MS || String(10 * 60 * 1000),
    UPLOAD_MAX_RESTARTS: process.env.UPLOAD_MAX_RESTARTS || "9999",
    UPLOAD_RESTART_BACKOFF_MS: process.env.UPLOAD_RESTART_BACKOFF_MS || "20000"
};

console.log("\n=== Keep Upload Alive (PC) ===");
console.log(`  Modo: ${FULL ? "FULL (todos os caps)" : "LATEST (1 cap/obra)"}`);
console.log("  Watchdog + restart infinito — Ctrl+C para parar\n");

if (BACKGROUND) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logPath = path.join(LOG_DIR, "keep-upload-alive.log");
    const out = fs.openSync(logPath, "a");
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args.filter((a) => a !== "--background")], {
        cwd: ROOT,
        detached: true,
        stdio: ["ignore", out, out],
        env
    });
    child.unref();
    console.log(`Background PID ${child.pid}`);
    console.log(`Log: ${logPath}`);
    process.exit(0);
}

// Sync índice live antes de começar (best-effort)
try {
    await spawnWithWatchdog(process.execPath, [path.join(ROOT, "scripts", "sync-live-cloud-index.mjs")], {
        cwd: ROOT,
        env,
        stallMs: 120_000,
        label: "sync-live-index"
    });
} catch (e) {
    console.warn("[keep-alive] sync live index falhou:", e.message);
}

const last = await runWithRestarts(
    (attempt) => {
        console.warn(`\n[keep-alive] tentativa #${attempt} — ${new Date().toISOString()}\n`);
        return spawnWithWatchdog(process.execPath, childArgs, {
            cwd: ROOT,
            env,
            label: "keep-upload-alive"
        });
    },
    {
        maxRestarts: Number(env.UPLOAD_MAX_RESTARTS),
        backoffMs: Number(env.UPLOAD_RESTART_BACKOFF_MS),
        isDone: (r) => r.code === 0 || r.code === 2
    }
);

process.exit(last.code ?? 1);
