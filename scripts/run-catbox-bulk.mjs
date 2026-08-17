#!/usr/bin/env node
/**
 * Bulk NexusToons → Catbox (+ álbuns por mangá se CATBOX_USERHASH) → site Akira.
 *
 * Uso:
 *   npm run bot:nexustoons:bulk:catbox -- --all
 *   npm run bot:nexustoons:bulk:catbox -- --all --full-catalog
 *   npm run bot:nexustoons:bulk:catbox -- --slug=meu-manga --latest-only
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catboxAlbumsEnabled, getCatboxUserHash } from "../bots/nexustoons-akira/hosting/catbox-albums.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

if (args.includes("--full-catalog") && !args.includes("--all")) {
    console.error("[ERRO] --full-catalog exige --all");
    process.exit(1);
}

if (!args.some((a) => a === "--all" || a.startsWith("--slug=") || a === "--slug")) {
    console.error("[ERRO] Indica --all ou --slug=...");
    process.exit(1);
}

const env = {
    ...process.env,
    HOSTING_ADAPTER: "catbox",
    NEXUSTOONS_HOSTING_ADAPTER: "catbox",
    TELEGRA_SKIP: "1",
    NEXUSTOONS_PURGE_LOCAL: "1",
    AKIRA_SKIP_CLOUD_PAGES: "1",
    NEXUSTOONS_BULK: "1",
    CATBOX_STATIC_FALLBACK: process.env.CATBOX_STATIC_FALLBACK || "false",
    LITTERBOX_SKIP: process.env.LITTERBOX_SKIP || "1",
    // Catbox IP bloqueado → Freeimage direto (sem tentar catbox por página)
    CATBOX_FORCE_FREEIMAGE: process.env.CATBOX_FORCE_FREEIMAGE || "1",
    CATBOX_SKIP: process.env.CATBOX_SKIP || "true",
    NEXUSTOONS_PURGE_LOCAL: process.env.NEXUSTOONS_PURGE_LOCAL || "1",
    NEXUSTOONS_USE_PLAYWRIGHT: process.env.NEXUSTOONS_USE_PLAYWRIGHT || "1",
    CATBOX_DELAY_MS: process.env.CATBOX_DELAY_MS || "0",
    FREEIMAGE_DELAY_MS: process.env.FREEIMAGE_DELAY_MS || "0",
    FREEIMAGE_TIMEOUT_MS: process.env.FREEIMAGE_TIMEOUT_MS || "45000",
    // Turbo: 50 págs/cap × 5 caps em paralelo (≈40× vs defaults antigos)
    STREAM_PAGE_MAX: process.env.STREAM_PAGE_MAX || "50",
    STREAM_PAGE_CONCURRENCY: process.env.STREAM_PAGE_CONCURRENCY || "50",
    PAGE_DOWNLOAD_CONCURRENCY: process.env.PAGE_DOWNLOAD_CONCURRENCY || "50",
    NEXUSTOONS_CHAPTER_CONCURRENCY: process.env.NEXUSTOONS_CHAPTER_CONCURRENCY || "5",
    NEXUSTOONS_MANGA_PARALLEL: process.env.NEXUSTOONS_MANGA_PARALLEL || "1",
    NEXUSTOONS_PW_POOL_SIZE: process.env.NEXUSTOONS_PW_POOL_SIZE || "5",
    NEXUSTOONS_CHAPTER_DELAY_MS: process.env.NEXUSTOONS_CHAPTER_DELAY_MS || "0",
    NEXUSTOONS_DELAY_MS: process.env.NEXUSTOONS_DELAY_MS || "0",
    NEXUSTOONS_PW_SETTLE_MS: process.env.NEXUSTOONS_PW_SETTLE_MS || "300",
    NEXUSTOONS_OVERLAP_PIPELINE: process.env.NEXUSTOONS_OVERLAP_PIPELINE || "1",
    NEXUSTOONS_PW_LITE: process.env.NEXUSTOONS_PW_LITE || "1",
    NEXUSTOONS_STATE_SAVE_EVERY: process.env.NEXUSTOONS_STATE_SAVE_EVERY || "5",
    PAGE_DOWNLOAD_TIMEOUT_MS: process.env.PAGE_DOWNLOAD_TIMEOUT_MS || "90000",
    NEXUSTOONS_PW_CHAPTER_TIMEOUT_MS: process.env.NEXUSTOONS_PW_CHAPTER_TIMEOUT_MS || "120000"
};

if (!env.AKIRA_PUBLISH_TOKEN) {
    console.warn("[AVISO] AKIRA_PUBLISH_TOKEN ausente — caps só aparecem após deploy/git.\n");
}

if (!getCatboxUserHash()) {
    console.warn("[AVISO] CATBOX_USERHASH ausente — uploads anónimos, sem álbuns por mangá.");
    console.warn("        Conta: https://catbox.moe → userhash no .env\n");
} else if (catboxAlbumsEnabled()) {
    console.log("[catbox-bulk] Álbuns por mangá: ON (data/catbox-albums.json)");
}

const via = env.CATBOX_SKIP === "true" || env.CATBOX_FORCE_FREEIMAGE === "1"
    ? "Freeimage (iili.io) direto — Catbox skipped"
    : "files.catbox.moe → Freeimage fallback";
console.log(`[catbox-bulk] Destino: ${via}`);
console.log(`[catbox-bulk] Concurrency: pages=${env.STREAM_PAGE_CONCURRENCY} chapters=${env.NEXUSTOONS_CHAPTER_CONCURRENCY} pwPool=${env.NEXUSTOONS_PW_POOL_SIZE}`);
console.log(`[catbox-bulk] Args: ${args.join(" ") || "(vazio)"}\n`);

const child = spawn(
    process.execPath,
    ["bots/nexustoons-akira/orchestrator/bulk-run.mjs", ...args],
    { cwd: ROOT, env, stdio: "inherit", shell: false }
);

child.on("exit", (code, signal) => {
    if (signal) {
        console.error(`[catbox-bulk] terminou por signal ${signal}`);
        process.exit(1);
    }
    process.exit(code ?? 1);
});
