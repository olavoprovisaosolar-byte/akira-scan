#!/usr/bin/env node
/**
 * ToonLivre → Telegra/Freeimage STREAM (sem copiar caps no disco).
 *
 * Uso:
 *   npm run migrate:toonlivre:hyper
 *   node scripts/migrate-toonlivre-stream.mjs --manga=obra-e7e46b19 --hyper
 *   node scripts/migrate-toonlivre-stream.mjs --all --hyper --background
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

process.env.NEXUSTOONS_CAPTURE_ADAPTER = "toonlivre";
process.env.HOSTING_ADAPTER = process.env.HOSTING_ADAPTER || "telegra";
process.env.NEXUSTOONS_HOSTING_ADAPTER = process.env.HOSTING_ADAPTER;
process.env.TELEGRA_SKIP = process.env.TELEGRA_SKIP || "0";
process.env.TELEGRA_STATIC_FALLBACK = process.env.TELEGRA_STATIC_FALLBACK || "false";
process.env.NEXUSTOONS_PURGE_LOCAL = "1";
process.env.NEXUSTOONS_BULK = "1";
process.env.FREEIMAGE_SKIP = process.env.FREEIMAGE_SKIP || "0";
process.env.NEXUSTOONS_DEFER_CATALOG = "1";

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const HYPER = args.includes("--hyper");
const ULTRA = args.includes("--ultra");
const MANGA = args.find((a) => a.startsWith("--manga="))?.split("=")[1] || null;
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);
const BACKGROUND = args.includes("--background");

if (HYPER) {
    process.env.PAGE_DOWNLOAD_CONCURRENCY = process.env.PAGE_DOWNLOAD_CONCURRENCY || "12";
    process.env.STREAM_PAGE_CONCURRENCY = process.env.STREAM_PAGE_CONCURRENCY || "6";
    process.env.STREAM_PAGE_MAX = "8";
    process.env.NEXUSTOONS_DELAY_MS = "30";
    process.env.TOONLIVRE_DELAY_MS = "30";
    process.env.TELEGRA_DELAY_MS = "0";
    process.env.NEXUSTOONS_CHAPTER_CONCURRENCY = process.env.NEXUSTOONS_CHAPTER_CONCURRENCY || "3";
    process.env.SHARP_SKIP_REENCODE = "1";
} else if (ULTRA) {
    process.env.PAGE_DOWNLOAD_CONCURRENCY = "8";
    process.env.STREAM_PAGE_CONCURRENCY = "4";
    process.env.NEXUSTOONS_CHAPTER_CONCURRENCY = "2";
}

const LOG_DIR = path.join(ROOT, "logs");
const LOG = path.join(LOG_DIR, "toonlivre-stream.log");
fs.mkdirSync(LOG_DIR, { recursive: true });

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(LOG, `${line}\n`); } catch { /* ignore */ }
}

if (BACKGROUND) {
    const childArgs = args.filter((a) => a !== "--background");
    const out = fs.openSync(LOG, "a");
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...childArgs], {
        cwd: ROOT,
        detached: true,
        stdio: ["ignore", out, out],
        env: { ...process.env }
    });
    child.unref();
    console.log(`ToonLivre STREAM iniciado (PID ${child.pid})`);
    console.log(`Log: ${LOG}`);
    process.exit(0);
}

const { getCaptureAdapter, closeCaptureAdapter } = await import("../bots/nexustoons-akira/capture/adapter.js");
const { getHostingAdapter, closeHostingAdapter } = await import("../bots/nexustoons-akira/hosting/adapter.js");
const { getUploadAdapter, closeUploadAdapter } = await import("../bots/nexustoons-akira/upload/adapter.js");
const { toStructuredPayload } = await import("../bots/nexustoons-akira/upload/akira-scan-api.js");
const { akiraCapId } = await import("../bots/nexustoons-akira/shared/ids.js");
const {
    loadState, saveStateImmediate, markProcessed, getChapterSkipReason
} = await import("../bots/nexustoons-akira/shared/state.js");
const { purgeAfterUploadSuccess } = await import("../bots/nexustoons-akira/shared/page-purge.js");
const { logChapterStart, logChapterDone } = await import("../bots/nexustoons-akira/shared/progress.js");

const CATALOGO = path.join(ROOT, "data", "catalogo-index.json");

function loadMangas() {
    const idx = JSON.parse(fs.readFileSync(CATALOGO, "utf8"));
    let list = (idx.mangas || []).filter((m) => m.id);
    if (MANGA) list = list.filter((m) => m.id === MANGA);
    if (!ALL && !MANGA) {
        // default: mangás com syncProntos baixo ou zero remoto
        list = list.filter((m) => !m.syncProntos || m.syncProntos < (m.totalCapitulos || 1));
    }
    if (LIMIT > 0) list = list.slice(0, LIMIT);
    return list;
}

const capture = await getCaptureAdapter("toonlivre");
const hosting = await getHostingAdapter("telegra");
const upload = await getUploadAdapter();
let state = loadState();

const mangas = loadMangas();
log(`=== ToonLivre STREAM ${HYPER ? "[HYPER]" : ULTRA ? "[ULTRA]" : ""} — ${mangas.length} mangá(s) ===`);
log("Capture: toonlivre API | Host: Telegra→Freeimage | SEM cópia local de caps");

let uploaded = 0;
let skipped = 0;
let failed = 0;

async function processManga(manga) {
    const mangaId = manga.id;
    let remote;
    try {
        remote = await capture.getManga(mangaId);
    } catch (e) {
        log(`[SKIP] ${manga.titulo || mangaId}: ${e.message}`);
        return;
    }

    const chapters = (remote.chapters || []).sort((a, b) => Number(a.number) - Number(b.number));
    const meta = {
        title: remote.title || manga.titulo,
        description: remote.description,
        author: remote.author,
        status: remote.status,
        nexusSlug: mangaId,
        akiraMangaId: mangaId
    };

    const pending = [];
    for (const ch of chapters) {
        const catalogCap = (manga.capitulos || []).find((c) => Number(c.numero) === Number(ch.number));
        const capId = catalogCap?.id || akiraCapId(mangaId, ch.number);
        const skip = getChapterSkipReason(state, mangaId, capId, mangaId, ch.number);
        if (skip.skip) {
            skipped++;
            continue;
        }
        pending.push({ ch, capId });
    }

    log(`[MANGÁ] ${meta.title} — ${pending.length}/${chapters.length} pendentes`);

    const concurrency = Math.max(1, Number(process.env.NEXUSTOONS_CHAPTER_CONCURRENCY || 2));
    let next = 0;

    async function worker() {
        while (true) {
            const i = next++;
            if (i >= pending.length) break;
            const { ch, capId } = pending[i];
            try {
                logChapterStart(ch.number, "?");
                const chapterJson = await capture.captureChapter(mangaId, ch, { mangaId, capId });
                logChapterStart(ch.number, chapterJson.pages.length);

                const hostResult = await hosting.hostChapter(chapterJson, meta);
                if (!hostResult.ok || !hostResult.chapter) {
                    throw new Error(hostResult.error || "hosting falhou");
                }

                const structured = toStructuredPayload(hostResult.chapter, {
                    ...meta,
                    sourceUrl: chapterJson.sourceUrl || `https://toonlivre.net/${mangaId}/${ch.number}`
                });

                const result = await upload.uploadChapter(structured, {
                    ...meta,
                    sourceUrl: structured.sourceUrl,
                    nexusChapterId: ch.id
                });

                if (!result.ok) throw new Error(result.error || "upload falhou");

                markProcessed(state, mangaId, capId, {
                    chapterNumber: String(ch.number),
                    akiraMangaId: mangaId,
                    akiraCapId: capId,
                    nexusChapterId: ch.id,
                    pagesCount: result.pagesSaved
                });
                saveStateImmediate(state);
                state = loadState();

                purgeAfterUploadSuccess({
                    mangaId,
                    capId,
                    hosting: hostResult.chapter.hosting || "freeimage",
                    pages: hostResult.chapter.pages || []
                });

                uploaded++;
                logChapterDone(ch.number, hostResult.chapter.hosting || "freeimage");
            } catch (e) {
                failed++;
                log(`  ✗ Cap ${ch.number}: ${e.message}`);
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, pending.length)) }, () => worker()));
}

try {
    for (let i = 0; i < mangas.length; i++) {
        log(`── ${i + 1}/${mangas.length} ──`);
        await processManga(mangas[i]);
    }
} finally {
    await closeCaptureAdapter();
    await closeHostingAdapter();
    if (upload.finalize) await upload.finalize();
    await closeUploadAdapter();
}

log(`=== FIM uploaded=${uploaded} skipped=${skipped} failed=${failed} ===`);
console.log(`Log: ${LOG}`);
