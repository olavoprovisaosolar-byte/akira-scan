#!/usr/bin/env node
/**
 * Purga única de páginas locais já publicadas no Cloudflare (cloud-static).
 *
 * Use SOMENTE após confirmar que os caps estão no CDN — não rode antes de deploy.
 *
 * Uso:
 *   node scripts/purge-processed-pages.mjs --dry-run
 *   node scripts/purge-processed-pages.mjs --confirm
 *   node scripts/purge-processed-pages.mjs --confirm --telegra-orphans
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    STATIC_PAGES_ROOT,
    chapterPagesDir,
    purgeChapterPagesDir,
    markLocalPurgedInIndex,
    pagesUseLocalStatic,
    isPurgeEnabled
} from "../bots/nexustoons-akira/shared/page-purge.js";
import { CLOUD_INDEX_PATH, loadState } from "../bots/nexustoons-akira/shared/state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONFIRM = args.includes("--confirm");
const TELEGRA_ORPHANS = args.includes("--telegra-orphans");

if (!DRY_RUN && !CONFIRM) {
    console.error("Uso: node scripts/purge-processed-pages.mjs (--dry-run | --confirm) [--telegra-orphans]");
    console.error("");
    console.error("  --dry-run           Lista caps elegíveis sem apagar");
    console.error("  --confirm           Apaga arquivos (requer deploy já feito para cloud-static)");
    console.error("  --telegra-orphans   Também apaga dirs locais de caps telegra/catbox (órfãos)");
    process.exit(1);
}

process.env.NEXUSTOONS_PURGE_LOCAL = "1";

function dirStats(dir) {
    if (!fs.existsSync(dir)) return { files: 0, bytes: 0 };
    let files = 0;
    let bytes = 0;
    for (const name of fs.readdirSync(dir)) {
        const fp = path.join(dir, name);
        try {
            const st = fs.statSync(fp);
            if (st.isFile()) {
                files++;
                bytes += st.size;
            }
        } catch { /* ignore */ }
    }
    return { files, bytes };
}

function loadIndex() {
    if (!fs.existsSync(CLOUD_INDEX_PATH)) return { caps: {} };
    return JSON.parse(fs.readFileSync(CLOUD_INDEX_PATH, "utf8"));
}

function main() {
    if (!isPurgeEnabled()) {
        console.error("NEXUSTOONS_PURGE_LOCAL está desligado.");
        process.exit(1);
    }

    const idx = loadIndex();
    const state = loadState();
    const candidates = [];

    for (const [key, rec] of Object.entries(idx.caps || {})) {
        if (!rec.done) continue;

        const dir = chapterPagesDir(rec.mangaId, rec.capId);
        const stats = dirStats(dir);
        if (stats.files === 0) continue;

        if (rec.hosting === "cloud-static" && !rec.localPurged) {
            candidates.push({ key, rec, stats, reason: "cloud-static pós-deploy" });
            continue;
        }

        if (TELEGRA_ORPHANS && (rec.hosting === "telegra" || rec.hosting === "catbox")) {
            if (!pagesUseLocalStatic(rec.pages || [])) {
                candidates.push({ key, rec, stats, reason: "órfão telegra/catbox" });
            }
        }
    }

    if (!candidates.length) {
        console.log("Nenhum cap com arquivos locais elegíveis para purge.");
        return;
    }

    let totalFiles = 0;
    let totalBytes = 0;

    console.log(`${DRY_RUN ? "[dry-run] " : ""}${candidates.length} cap(s) elegíveis:\n`);
    for (const { key, rec, stats, reason } of candidates) {
        totalFiles += stats.files;
        totalBytes += stats.bytes;
        const inState = Boolean(state.processed[`${rec.nexusSlug || "?"}/${rec.capId}`]);
        console.log(`  ${key}  hosting=${rec.hosting}  ${stats.files} arq  ${(stats.bytes / 1024 / 1024).toFixed(1)} MB  (${reason})`);
    }

    console.log(`\nTotal: ${totalFiles} arquivos, ${(totalBytes / 1024 / 1024).toFixed(1)} MB em ${STATIC_PAGES_ROOT}`);

    if (DRY_RUN) {
        console.log("\nRode com --confirm para apagar (após deploy confirmado).");
        return;
    }

    let purged = 0;
    for (const { rec } of candidates) {
        const result = purgeChapterPagesDir(rec.mangaId, rec.capId);
        if (result.purged) {
            purged++;
            markLocalPurgedInIndex(rec.mangaId, rec.capId);
        }
    }

    console.log(`\n✓ ${purged} cap(s) purgados.`);
}

main();
