#!/usr/bin/env node
/**
 * Bot de upload do zero — NexusToons → Freeimage (iili.io) → AkiraScan
 *
 * Simples, previsível, sem Catbox/Discord/Telegra/litter.
 *
 * Uso:
 *   node bots/upload-bot/index.mjs --slug=SLUG
 *   node bots/upload-bot/index.mjs --slug=SLUG --all-chapters
 *   node bots/upload-bot/index.mjs --all --latest-only
 *   node bots/upload-bot/index.mjs --slug=SLUG --dry-run
 *   node bots/upload-bot/index.mjs --probe
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

import { loadConfig } from "../nexustoons-akira/shared/config.js";
import { getCaptureAdapter, closeCaptureAdapter } from "../nexustoons-akira/capture/adapter.js";
import { getHostingAdapter, closeHostingAdapter } from "../nexustoons-akira/hosting/adapter.js";
import { getUploadAdapter, closeUploadAdapter } from "../nexustoons-akira/upload/adapter.js";
import { toStructuredPayload } from "../nexustoons-akira/upload/akira-scan-api.js";
import {
    loadState,
    saveStateImmediate,
    getChapterSkipReason,
    markProcessed,
    rollbackChapterPublication
} from "../nexustoons-akira/shared/state.js";
import { akiraMangaId, akiraCapId } from "../nexustoons-akira/shared/ids.js";
import { selectChaptersForRun } from "../nexustoons-akira/shared/chapters.js";
import { log, setLogFile } from "../nexustoons-akira/shared/logger.js";
import { purgeAfterUploadSuccess } from "../nexustoons-akira/shared/page-purge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const CONFIG_MANGAS = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");
const LOG_DIR = path.join(ROOT, "logs");

const args = process.argv.slice(2);
const SLUG = args.find((a) => a.startsWith("--slug="))?.split("=")[1]
    || (args.includes("--slug") ? args[args.indexOf("--slug") + 1] : "")
    || "";
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0) || 0;
const DRY_RUN = args.includes("--dry-run");
const PROBE = args.includes("--probe");
const ALL = args.includes("--all");
const ALL_CHAPTERS = args.includes("--all-chapters");
const LATEST_ONLY = args.includes("--latest-only") || (!ALL_CHAPTERS && !args.includes("--all-recent"));

process.env.HOSTING_ADAPTER = process.env.HOSTING_ADAPTER || "freeimage";
process.env.NEXUSTOONS_HOSTING_ADAPTER = process.env.NEXUSTOONS_HOSTING_ADAPTER || "freeimage";
process.env.TELEGRA_SKIP = "1";
process.env.CATBOX_SKIP = process.env.CATBOX_SKIP || "true";
process.env.NEXUSTOONS_USE_PLAYWRIGHT = process.env.NEXUSTOONS_USE_PLAYWRIGHT || "1";

const appConfig = loadConfig();

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function loadMangaQueue() {
    const raw = JSON.parse(fs.readFileSync(CONFIG_MANGAS, "utf8"));
    let list = (raw.mangas || []).filter((m) => m.enabled !== false && (m.nexusSlug || m.slug));
    if (SLUG) list = list.filter((m) => (m.nexusSlug || m.slug) === SLUG);
    if (!SLUG && !ALL) {
        throw new Error("Use --slug=SLUG ou --all");
    }
    if (LIMIT > 0) list = list.slice(0, LIMIT);
    return list.map((m) => ({
        slug: m.nexusSlug || m.slug,
        akiraId: m.akiraId || null,
        title: m.title || m.nexusSlug || m.slug
    }));
}

async function probeNexus() {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "probe-nexus-access.mjs")], {
        cwd: ROOT,
        encoding: "utf8",
        env: process.env,
        stdio: "inherit"
    });
    return r.status ?? 1;
}

async function processManga(entry, capture, hosting, upload, state, stats) {
    const { slug } = entry;
    const mangaId = entry.akiraId || akiraMangaId(slug);
    log.info(`Mangá ${slug}`, { mangaId, title: entry.title });

    const remote = await capture.getManga(slug);
    const chapters = selectChaptersForRun(remote.chapters || [], {
        allChapters: ALL_CHAPTERS,
        latestOnly: LATEST_ONLY
    });

    if (!chapters.length) {
        log.warn(`Sem capítulos: ${slug}`);
        return;
    }

    const meta = {
        nexusSlug: slug,
        tituloManga: remote.title || entry.title,
        akiraMangaId: mangaId,
        coverImage: remote.coverImage,
        bannerImage: remote.bannerImage
    };

    for (const ch of chapters) {
        const capId = akiraCapId(mangaId, ch.number);
        const skip = getChapterSkipReason(state, slug, capId, {
            akiraMangaId: mangaId,
            chapterNumber: ch.number
        });
        if (skip) {
            log.info(`skip cap ${ch.number}`, { reason: skip });
            stats.skipped++;
            continue;
        }

        const sourceUrl = `${appConfig.nexustoonsBaseUrl}/manga/${slug}/${ch.number}`;
        log.info(`Capítulo ${ch.number}`, { slug, capId });

        if (DRY_RUN) {
            stats.dryRun++;
            continue;
        }

        try {
            const chapterJson = await capture.captureChapter(slug, ch, { mangaId, capId });
            const hostResult = await hosting.hostChapter(chapterJson, meta);
            if (!hostResult.ok || !hostResult.chapter) {
                log.error(`Hosting falhou cap ${ch.number}`, { error: hostResult.error });
                stats.failed++;
                continue;
            }

            const structured = toStructuredPayload(hostResult.chapter, { ...meta, sourceUrl });
            const result = await upload.uploadChapter(structured, {
                ...meta,
                sourceUrl,
                nexusChapterId: ch.id
            });

            if (!result.ok) {
                rollbackChapterPublication({
                    mangaSlug: slug,
                    capId,
                    akiraMangaId: mangaId,
                    chapterNumber: ch.number
                });
                log.error(`Publish falhou cap ${ch.number}`, { error: result.error });
                stats.failed++;
                continue;
            }

            markProcessed(state, slug, capId, {
                chapterNumber: String(ch.number),
                akiraMangaId: mangaId,
                akiraCapId: capId,
                nexusChapterId: ch.id,
                pagesCount: result.pagesSaved,
                hosting: "freeimage"
            });
            saveStateImmediate(state);
            purgeAfterUploadSuccess({
                mangaId,
                capId,
                hosting: "freeimage",
                pages: hostResult.chapter.pages || []
            });
            stats.uploaded++;
            log.success(`OK cap ${ch.number}`, { pages: result.pagesSaved, hosting: "freeimage" });
        } catch (err) {
            const msg = err?.message || String(err);
            log.error(`Erro cap ${ch.number}`, { err: msg });
            stats.failed++;
            if (msg.includes("NEXUS_CF_BLOCKED") || msg.includes("Just a moment")) {
                stats.cfBlocked = true;
                throw err;
            }
        }

        const delay = Number(process.env.NEXUSTOONS_CHAPTER_DELAY_MS || 800);
        if (delay > 0) await sleep(delay);
    }
}

async function main() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    setLogFile(path.join(LOG_DIR, "upload-bot.log"));

    console.log("\n=== Upload Bot (Nexus → Freeimage → Akira) ===");
    console.log(`  hosting: freeimage (iili.io)`);
    console.log(`  modo: ${DRY_RUN ? "DRY-RUN" : ALL_CHAPTERS ? "ALL-CHAPTERS" : "LATEST"}`);
    console.log("");

    if (PROBE) {
        const code = await probeNexus();
        process.exit(code);
    }

    const queue = loadMangaQueue();
    log.info(`Fila: ${queue.length} mangá(s)`);

    const stats = { uploaded: 0, skipped: 0, failed: 0, dryRun: 0, cfBlocked: false };
    const state = loadState();
    let capture;
    let hosting;
    let upload;

    try {
        capture = await getCaptureAdapter();
        hosting = await getHostingAdapter("freeimage");
        upload = await getUploadAdapter();

        for (const entry of queue) {
            try {
                await processManga(entry, capture, hosting, upload, state, stats);
            } catch (err) {
                const msg = err?.message || String(err);
                if (msg.includes("NEXUS_CF_BLOCKED") || msg.includes("Just a moment") || /HTTP 403/.test(msg) || /Cloudflare/i.test(msg)) {
                    stats.cfBlocked = true;
                    log.error("Nexus Cloudflare bloqueou este IP", { err: msg.slice(0, 160) });
                    break;
                }
                log.error(`Mangá falhou: ${entry.slug}`, { err: msg.slice(0, 160) });
                stats.failed++;
            }
            if (stats.cfBlocked) break;
        }
    } finally {
        await closeCaptureAdapter().catch(() => {});
        await closeHostingAdapter().catch(() => {});
        await closeUploadAdapter().catch(() => {});
        saveStateImmediate(state);
    }

    console.log("\n=== Resumo ===");
    console.log(JSON.stringify(stats, null, 2));

    if (stats.cfBlocked) {
        log.error("Nexus bloqueou (Cloudflare). No browser: copie cf_clearance para NEXUSTOONS_COOKIE no .env");
        process.exit(3);
    }
    if (stats.failed > 0 && stats.uploaded === 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
