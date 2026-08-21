#!/usr/bin/env node
/**
 * Mantém o upload-bot vivo no PC (watchdog + restart).
 *
 *   node bots/upload-bot/keep-alive.mjs
 *   node bots/upload-bot/keep-alive.mjs --all-chapters
 *   node bots/upload-bot/keep-alive.mjs --background
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWithRestarts, spawnWithWatchdog } from "../../scripts/lib/supervised-spawn.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG_DIR = path.join(ROOT, "logs");
const args = process.argv.slice(2);
const BACKGROUND = args.includes("--background");
const childFlags = args.filter((a) => a !== "--background");

if (!childFlags.includes("--all") && !childFlags.some((a) => a.startsWith("--slug="))) {
    childFlags.push("--all");
}
if (!childFlags.includes("--all-chapters") && !childFlags.includes("--latest-only")) {
    childFlags.push("--latest-only");
}

const env = {
    ...process.env,
    HOSTING_ADAPTER: "freeimage",
    NEXUSTOONS_HOSTING_ADAPTER: "freeimage",
    TELEGRA_SKIP: "1",
    CATBOX_SKIP: "true",
    NEXUSTOONS_USE_PLAYWRIGHT: "1",
    NEXUSTOONS_PURGE_LOCAL: "1",
    UPLOAD_STALL_MS: process.env.UPLOAD_STALL_MS || String(10 * 60 * 1000),
    UPLOAD_MAX_RESTARTS: process.env.UPLOAD_MAX_RESTARTS || "9999",
    UPLOAD_RESTART_BACKOFF_MS: process.env.UPLOAD_RESTART_BACKOFF_MS || "20000"
};

const botPath = path.join(ROOT, "bots", "upload-bot", "index.mjs");

console.log("\n=== Upload Bot Keep-Alive ===");
console.log(`  flags: ${childFlags.join(" ")}`);
console.log("  Freeimage → iili.io · Ctrl+C para parar\n");

if (BACKGROUND) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const logPath = path.join(LOG_DIR, "upload-bot-keepalive.log");
    const out = fs.openSync(logPath, "a");
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...childFlags], {
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

const result = await runWithRestarts(
    () => spawnWithWatchdog(process.execPath, [botPath, ...childFlags], {
        cwd: ROOT,
        env,
        stallMs: Number(env.UPLOAD_STALL_MS),
        label: "upload-bot"
    }),
    {
        maxRestarts: Number(env.UPLOAD_MAX_RESTARTS),
        backoffMs: Number(env.UPLOAD_RESTART_BACKOFF_MS),
        isDone: (r) => r.code === 0 || r.code === 2
    }
);

process.exit(result.code ?? 1);
