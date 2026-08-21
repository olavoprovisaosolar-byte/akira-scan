#!/usr/bin/env node
/**
 * Mantém o upload vivo no PC — agora aponta para o bot limpo (Freeimage).
 * Preferir: npm run upload:bot:keep-alive
 *
 * Uso:
 *   node scripts/keep-upload-alive.mjs
 *   node scripts/keep-upload-alive.mjs --full-chapters
 *   node scripts/keep-upload-alive.mjs --background
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const FULL = args.includes("--full-chapters") || args.includes("--all-chapters");
const BACKGROUND = args.includes("--background");

const childFlags = ["--all"];
if (FULL) childFlags.push("--all-chapters");
else childFlags.push("--latest-only");
if (BACKGROUND) childFlags.push("--background");

const keepAlive = path.join(ROOT, "bots", "upload-bot", "keep-alive.mjs");
const child = spawn(process.execPath, [keepAlive, ...childFlags], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
});
child.on("exit", (code) => process.exit(code ?? 1));
