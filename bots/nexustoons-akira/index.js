#!/usr/bin/env node
/**
 * Orquestrador principal NexusToons → Telegra.ph → Akira Scan
 *
 * Uso:
 *   node bots/nexustoons-akira/index.js
 *   node bots/nexustoons-akira/index.js --slug=reencarnacao-do-deus-demonio
 *   node bots/nexustoons-akira/index.js --limit=3 --dry-run
 *   node bots/nexustoons-akira/index.js --slug=SLUG --latest-only   # explícito (padrão)
 *   node bots/nexustoons-akira/index.js --all-recent
 *   node bots/nexustoons-akira/index.js --slug=SLUG --all-chapters --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import { loadConfig } from "./shared/config.js";
import { getCaptureAdapter, closeCaptureAdapter } from "./capture/adapter.js";
import { getHostingAdapter, closeHostingAdapter } from "./hosting/adapter.js";
import { getUploadAdapter, closeUploadAdapter } from "./upload/adapter.js";
import { toStructuredPayload } from "./upload/akira-scan-api.js";
import {
    loadManifest,
    saveManifest,
    markChapter,
    upsertMangaEntry
} from "./shared/manifest.js";
import {
    loadState,
    saveState,
    saveStateImmediate,
    getChapterSkipReason,
    markProcessed,
    rollbackChapterPublication,
    isMangaFullyInState
} from "./shared/state.js";
import { akiraMangaId, akiraCapId } from "./shared/ids.js";
import { selectChaptersForRun } from "./shared/chapters.js";
import { log, setLogFile } from "./shared/logger.js";
import { logChapterStart, logChapterDone, logChapterSkipped } from "./shared/progress.js";
import { runBatchDeploy } from "./shared/batch-deploy.mjs";
import { purgeAfterUploadSuccess } from "./shared/page-purge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_MANGAS_PATH = path.join(__dirname, "config.mangas.json");
const appConfig = loadConfig();

const args = process.argv.slice(2);
const SLUG_FILTER = args.find((a) => a.startsWith("--slug="))?.split("=")[1]
    || (args.includes("--slug") ? args[args.indexOf("--slug") + 1] : "")
    || "";
const MANGA_LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]
    || (args.includes("--limit") ? args[args.indexOf("--limit") + 1] : 0)
    || 0);
const DRY_RUN = args.includes("--dry-run");
const ALL_RECENT = args.includes("--all-recent");
const ALL_CHAPTERS = args.includes("--all-chapters");
const LATEST_ONLY = args.includes("--latest-only") || (!ALL_CHAPTERS && !ALL_RECENT);
const BATCH_DEPLOY = args.includes("--batch-deploy")
    || (ALL_CHAPTERS && process.env.NEXUSTOONS_BULK === "1");
const BULK_MODE = process.env.NEXUSTOONS_BULK === "1" || args.includes("--bulk");
const MULTI_BULK = process.env.NEXUSTOONS_MULTI_BULK === "1" || args.includes("--all");
const SKIP_DEPLOY = args.includes("--no-deploy") || MULTI_BULK;

const DEFAULT_CHAPTER_DELAY = process.env.NEXUSTOONS_BULK === "1" ? 800 : 1500;
const CHAPTER_DELAY_MS = Math.max(0, Number(process.env.NEXUSTOONS_CHAPTER_DELAY_MS || DEFAULT_CHAPTER_DELAY));
const CHAPTER_CONCURRENCY = Math.max(1, Number(process.env.NEXUSTOONS_CHAPTER_CONCURRENCY || 1));
const STATE_SAVE_EVERY = Math.max(1, Number(process.env.NEXUSTOONS_STATE_SAVE_EVERY || 1));
const OVERLAP_PIPELINE = process.env.NEXUSTOONS_OVERLAP_PIPELINE === "1"
    || process.env.NEXUSTOONS_OVERLAP_PIPELINE === "true";

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

if (ALL_CHAPTERS && !SLUG_FILTER && !MULTI_BULK) {
    log.error("--all-chapters exige --slug=SLUG (backfill de um mangá por vez) ou --all");
    process.exit(1);
}

if (LATEST_ONLY && (ALL_CHAPTERS || ALL_RECENT)) {
    log.error("--latest-only conflita com --all-chapters ou --all-recent");
    process.exit(1);
}

function loadMangaConfig() {
    if (!fs.existsSync(CONFIG_MANGAS_PATH)) return { mangas: [] };
    try {
        return JSON.parse(fs.readFileSync(CONFIG_MANGAS_PATH, "utf8"));
    } catch {
        return { mangas: [] };
    }
}

function resolveMangaList(config) {
    const all = (config.mangas || []).map((m) => ({
        slug: m.nexusSlug || m.slug,
        akiraId: m.akiraId || null,
        title: m.title || null,
        enabled: m.enabled !== false
    }));

    // --slug= força processar mesmo se enabled:false
    if (SLUG_FILTER) {
        const hit = all.find((m) => m.slug === SLUG_FILTER);
        if (hit) return [hit];
        return [{ slug: SLUG_FILTER, akiraId: null, title: null, enabled: true }];
    }

    const fromConfig = all.filter((m) => m.enabled);
    if (fromConfig.length) return fromConfig;
    return [];
}

async function fetchCatalogMangas(capture, config) {
    const configured = resolveMangaList(config);
    if (configured.length) return configured;

    log.info("Nenhum config.mangas.json — buscando catálogo NexusToons (página 1)");
    const list = await capture.listMangas({ page: 1, limit: MANGA_LIMIT || 20 });
    return list.map((m) => ({ slug: m.slug, akiraId: null, title: m.title }));
}

function filterNewChapters(state, slug, chapters, mangaId) {
    const newOnes = [];
    let skipped = 0;

    for (const ch of chapters) {
        const capId = akiraCapId(mangaId, ch.number);
        const skipInfo = getChapterSkipReason(state, slug, capId, mangaId, ch.number);
        if (skipInfo.skip) {
            if (BULK_MODE) {
                logChapterSkipped(ch.number, skipInfo.source || skipInfo.reason);
            } else {
                log.info(`skip capítulo ${ch.number} (já publicado)`, {
                    slug,
                    capId,
                    source: skipInfo.source,
                    reason: skipInfo.reason
                });
            }
            skipped++;
            continue;
        }
        newOnes.push(ch);
    }

    return { newOnes, skipped };
}

async function processManga(capture, hosting, upload, manifest, state, entry, mangaIndex = null, mangaTotal = null) {
    const { slug, akiraId: explicitId, title: configTitle } = entry;
    if (SLUG_FILTER && slug !== SLUG_FILTER) return { captured: 0, hosted: 0, uploaded: 0, skipped: 0, skippedManga: false };

    const label = configTitle || slug;
    if (BULK_MODE && mangaIndex != null && mangaTotal != null) {
        log.tag("MANGÁ", `${mangaIndex}/${mangaTotal} Processando '${label}' | slug=${slug}`);
    } else {
        log.info(`Lendo mangá ${slug}...`);
    }

    let remote;
    try {
        remote = await capture.getManga(slug);
    } catch (e) {
        log.error(`Falha ao ler mangá ${slug}`, { err: e.message });
        return { captured: 0, hosted: 0, uploaded: 0, skipped: 0, skippedManga: false };
    }

    const totalRemoteChapters = remote.chapters?.length || 0;
    if (BULK_MODE && isMangaFullyInState(state, slug, totalRemoteChapters)) {
        log.info(`Mangá já completo no state (${totalRemoteChapters} caps)`, { slug, title: label });
        return { captured: 0, hosted: 0, uploaded: 0, skipped: totalRemoteChapters, skippedManga: true };
    }

    const mangaId = explicitId || akiraMangaId(slug, null);

    upsertMangaEntry(manifest, slug, {
        akiraId: mangaId,
        nexusId: remote.id,
        title: remote.title,
        lastChecked: new Date().toISOString()
    });

    let chapters;
    if (ALL_CHAPTERS) {
        chapters = await capture.listChapters(slug);
        log.info(`Backfill: ${chapters.length} capítulos listados para ${slug}`);
    } else {
        chapters = remote.chapters || [];
    }

    chapters = selectChaptersForRun(chapters, { allChapters: ALL_CHAPTERS, allRecent: ALL_RECENT });

    if (LATEST_ONLY && chapters.length === 1) {
        log.info(`Modo latest-only: capítulo ${chapters[0].number} (mais recente)`, { slug });
    }

    const { newOnes, skipped } = filterNewChapters(state, slug, chapters, mangaId);

    if (!newOnes.length) {
        log.info(`Sem caps novos para ${slug}`, { total: chapters.length, skipped });
        return { captured: 0, hosted: 0, uploaded: 0, skipped };
    }

    log.info(`Caps novos detectados para ${slug}`, { count: newOnes.length });

    let captured = 0;
    let hosted = 0;
    let uploaded = 0;
    let prefetchedChapter = null;
    let prefetchMeta = null;
    let pendingStateSaves = 0;

    const meta = {
        title: remote.title,
        description: remote.description,
        author: remote.author,
        status: remote.status,
        nexusSlug: slug,
        akiraMangaId: mangaId
    };

    function maybeSaveState() {
        pendingStateSaves++;
        if (pendingStateSaves >= STATE_SAVE_EVERY) {
            saveStateImmediate(state);
            pendingStateSaves = 0;
        }
    }

    async function runChapterPipeline(ch) {
        const capId = akiraCapId(mangaId, ch.number);
        const sourceUrl = `${appConfig.nexustoonsBaseUrl}/manga/${slug}/${ch.number}`;

        if (BULK_MODE) {
            logChapterStart(ch.number, "?");
        } else {
            log.info(`Processando capítulo ${ch.number}`, { slug, capId, nexusId: ch.id });
        }

        if (DRY_RUN) {
            markChapter(manifest, slug, ch.number, { capId, captured: false, dryRun: true });
            captured++;
            return;
        }

        const chapterJson = await capture.captureChapter(slug, ch, { mangaId, capId });
        captured++;

        if (BULK_MODE) {
            logChapterStart(ch.number, chapterJson.pages.length);
        }

        const hostResult = await hosting.hostChapter(chapterJson, meta);
        if (!hostResult.ok || !hostResult.chapter) {
            markChapter(manifest, slug, ch.number, {
                capId,
                captured: true,
                hosted: false,
                error: hostResult.error || "hosting falhou"
            });
            log.error(`Hosting falhou capítulo ${ch.number}`, { slug, capId, error: hostResult.error });
            return;
        }
        hosted++;

        const structured = toStructuredPayload(hostResult.chapter, {
            ...meta,
            sourceUrl
        });

        const result = await upload.uploadChapter(structured, {
            ...meta,
            sourceUrl,
            nexusChapterId: ch.id
        });

        if (result.ok) {
            markChapter(manifest, slug, ch.number, {
                capId,
                captured: true,
                hosted: true,
                uploaded: true,
                hosting: hostResult.chapter?.hosting || "telegra",
                pages: result.pagesSaved
            });
            markProcessed(state, slug, capId, {
                chapterNumber: String(ch.number),
                akiraMangaId: mangaId,
                akiraCapId: capId,
                nexusChapterId: ch.id,
                pagesCount: result.pagesSaved
            });
            maybeSaveState();
            purgeAfterUploadSuccess({
                mangaId,
                capId,
                hosting: hostResult.chapter?.hosting || "telegra",
                pages: hostResult.chapter?.pages || []
            });
            uploaded++;
            if (BULK_MODE) {
                logChapterDone(ch.number, hostResult.chapter?.hosting || "telegra");
            } else {
                log.success(`Capítulo ${ch.number} publicado`, { pages: result.pagesSaved });
            }
        } else {
            rollbackChapterPublication({
                mangaSlug: slug,
                capId,
                akiraMangaId: mangaId,
                chapterNumber: ch.number
            });
            markChapter(manifest, slug, ch.number, {
                capId,
                captured: true,
                hosted: true,
                uploaded: false,
                error: result.error
            });
            log.error(`Upload falhou capítulo ${ch.number} — rollback aplicado`, { slug, capId, error: result.error });
        }
    }

    if (CHAPTER_CONCURRENCY > 1 && !DRY_RUN) {
        for (let ci = 0; ci < newOnes.length; ci += CHAPTER_CONCURRENCY) {
            if (ci > 0 && CHAPTER_DELAY_MS > 0) await sleep(CHAPTER_DELAY_MS);
            const batch = newOnes.slice(ci, ci + CHAPTER_CONCURRENCY);
            const results = await Promise.allSettled(batch.map((ch) => runChapterPipeline(ch)));
            for (const r of results) {
                if (r.status === "rejected") {
                    log.critical("Pipeline falhou capítulo em lote", { slug, err: r.reason?.message });
                }
            }
        }
    } else for (let ci = 0; ci < newOnes.length; ci++) {
        const ch = newOnes[ci];
        const capId = akiraCapId(mangaId, ch.number);
        const sourceUrl = `${appConfig.nexustoonsBaseUrl}/manga/${slug}/${ch.number}`;

        if (BULK_MODE) {
            logChapterStart(ch.number, "?");
        } else {
            log.info(`Processando capítulo ${ch.number}`, { slug, capId, nexusId: ch.id });
        }

        if (DRY_RUN) {
            markChapter(manifest, slug, ch.number, { capId, captured: false, dryRun: true });
            captured++;
            continue;
        }

        if (ci > 0 && CHAPTER_DELAY_MS > 0) await sleep(CHAPTER_DELAY_MS);

        try {
            let chapterJson;
            if (prefetchedChapter && prefetchMeta?.number === ch.number) {
                chapterJson = prefetchedChapter;
                prefetchedChapter = null;
                prefetchMeta = null;
            } else {
                chapterJson = await capture.captureChapter(slug, ch, { mangaId, capId });
            }
            captured++;

            if (BULK_MODE) {
                logChapterStart(ch.number, chapterJson.pages.length);
            }

            let prefetchPromise = null;
            if (OVERLAP_PIPELINE && ci + 1 < newOnes.length && !DRY_RUN) {
                const nextCh = newOnes[ci + 1];
                const nextCapId = akiraCapId(mangaId, nextCh.number);
                prefetchPromise = capture.captureChapter(slug, nextCh, { mangaId, capId: nextCapId })
                    .then((data) => ({ ok: true, data, number: nextCh.number }))
                    .catch((err) => ({ ok: false, err, number: nextCh.number }));
            }

            const hostResult = await hosting.hostChapter(chapterJson, meta);
            if (!hostResult.ok || !hostResult.chapter) {
                if (prefetchPromise) {
                    const pf = await prefetchPromise;
                    if (pf.ok) {
                        prefetchedChapter = pf.data;
                        prefetchMeta = { number: pf.number };
                    }
                }
                markChapter(manifest, slug, ch.number, {
                    capId,
                    captured: true,
                    hosted: false,
                    error: hostResult.error || "hosting falhou"
                });
                log.error(`Hosting falhou capítulo ${ch.number}`, { slug, capId, error: hostResult.error });
                continue;
            }
            hosted++;

            const structured = toStructuredPayload(hostResult.chapter, {
                ...meta,
                sourceUrl
            });

            const result = await upload.uploadChapter(structured, {
                ...meta,
                sourceUrl,
                nexusChapterId: ch.id
            });

            if (result.ok) {
                markChapter(manifest, slug, ch.number, {
                    capId,
                    captured: true,
                    hosted: true,
                    uploaded: true,
                    hosting: hostResult.chapter?.hosting || "telegra",
                    pages: result.pagesSaved
                });
                markProcessed(state, slug, capId, {
                    chapterNumber: String(ch.number),
                    akiraMangaId: mangaId,
                    akiraCapId: capId,
                    nexusChapterId: ch.id,
                    pagesCount: result.pagesSaved
                });
                maybeSaveState();
                purgeAfterUploadSuccess({
                    mangaId,
                    capId,
                    hosting: hostResult.chapter?.hosting || "telegra",
                    pages: hostResult.chapter?.pages || []
                });
                uploaded++;
                if (BULK_MODE) {
                    logChapterDone(ch.number, hostResult.chapter?.hosting || "telegra");
                } else {
                    log.success(`Capítulo ${ch.number} publicado`, { pages: result.pagesSaved });
                }
            } else {
                rollbackChapterPublication({
                    mangaSlug: slug,
                    capId,
                    akiraMangaId: mangaId,
                    chapterNumber: ch.number
                });
                markChapter(manifest, slug, ch.number, {
                    capId,
                    captured: true,
                    hosted: true,
                    uploaded: false,
                    error: result.error
                });
                log.error(`Upload falhou capítulo ${ch.number} — rollback aplicado`, { slug, capId, error: result.error });
            }

            if (prefetchPromise) {
                const pf = await prefetchPromise;
                if (pf.ok) {
                    prefetchedChapter = pf.data;
                    prefetchMeta = { number: pf.number };
                } else {
                    log.warn(`Prefetch capítulo ${pf.number} falhou — será recapturado`, { err: pf.err?.message });
                    prefetchedChapter = null;
                    prefetchMeta = null;
                }
            }
        } catch (e) {
            markChapter(manifest, slug, ch.number, { capId, captured: false, error: e.message });
            log.critical(`Pipeline falhou capítulo ${ch.number}`, { slug, err: e.message });
        }
    }

    if (pendingStateSaves > 0) {
        saveStateImmediate(state);
        pendingStateSaves = 0;
    }

    if (upload.flushDeferredCatalog) {
        try {
            upload.flushDeferredCatalog();
        } catch (e) {
            log.error(`Flush catálogo defer falhou para ${slug}`, { err: e.message });
        }
    }

    return { captured, hosted, uploaded, skipped, skippedManga: false };
}

async function main() {
    if (BULK_MODE) {
        setLogFile("bulk-nexustoons.log");
    }

    log.info("=== NexusToons → Telegra → Akira Scan ===", {
        dryRun: DRY_RUN,
        latestOnly: LATEST_ONLY,
        allRecent: ALL_RECENT,
        allChapters: ALL_CHAPTERS,
        bulkMode: BULK_MODE,
        batchDeploy: BATCH_DEPLOY && !SKIP_DEPLOY,
        slug: SLUG_FILTER || null,
        baseUrl: appConfig.nexustoonsBaseUrl
    });

    const config = loadMangaConfig();
    const manifest = loadManifest();
    const state = loadState();
    const capture = await getCaptureAdapter();
    const hosting = await getHostingAdapter();
    const upload = await getUploadAdapter();

    let mangas = await fetchCatalogMangas(capture, config);
    if (MANGA_LIMIT > 0) mangas = mangas.slice(0, MANGA_LIMIT);
    if (SLUG_FILTER) mangas = mangas.filter((m) => m.slug === SLUG_FILTER);

    if (!mangas.length) {
        log.warn("Nenhum manga para processar. Edite bots/nexustoons-akira/config.mangas.json");
        process.exit(0);
    }

    let totalCaptured = 0;
    let totalHosted = 0;
    let totalUploaded = 0;
    let totalSkipped = 0;
    let mangasSkippedComplete = 0;

    for (let mi = 0; mi < mangas.length; mi++) {
        const entry = mangas[mi];
        const stats = await processManga(
            capture, hosting, upload, manifest, state, entry,
            mangas.length > 1 ? mi + 1 : null,
            mangas.length > 1 ? mangas.length : null
        );
        totalCaptured += stats.captured;
        totalHosted += stats.hosted;
        totalUploaded += stats.uploaded;
        totalSkipped += stats.skipped;
        if (stats.skippedManga) mangasSkippedComplete++;
        saveManifest(manifest);
    }

    if (!DRY_RUN && totalUploaded > 0) {
        await upload.finalize?.();
    }

    if (BATCH_DEPLOY && !DRY_RUN && !SKIP_DEPLOY && (totalUploaded > 0 || totalHosted > 0)) {
        try {
            await runBatchDeploy();
        } catch (e) {
            log.critical("Batch deploy falhou", { err: e.message });
            process.exitCode = 1;
        }
    }

    await closeCaptureAdapter();
    await closeHostingAdapter();
    await closeUploadAdapter();

    log.info("Concluído", {
        mangas: mangas.length,
        mangasSkippedComplete,
        captured: totalCaptured,
        hosted: totalHosted,
        uploaded: totalUploaded,
        skipped: totalSkipped
    });
    saveManifest(manifest);
    if (Math.max(1, Number(process.env.NEXUSTOONS_MANGA_PARALLEL || 1)) > 1) {
        saveStateImmediate(state);
    } else {
        saveState(state);
    }
}

const isMain = process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
    main().catch(async (e) => {
        log.error("Orquestrador falhou", { err: e.message, stack: e.stack });
        await closeCaptureAdapter();
        await closeHostingAdapter();
        await closeUploadAdapter();
        process.exit(1);
    });
}

export { main };
