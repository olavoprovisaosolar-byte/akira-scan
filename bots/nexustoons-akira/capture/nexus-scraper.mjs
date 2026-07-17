#!/usr/bin/env node
/**
 * Facade NexusToons — catálogo (OrionCrypto) + páginas (Playwright/Turnstile).
 * Pipeline: scrape → hosting (Telegra → cloud-static fallback) → GitHub index sync → state sync → ghost cleanup.
 *
 * Uso:
 *   node bots/nexustoons-akira/capture/nexus-scraper.mjs --slug=SLUG
 *   node bots/nexustoons-akira/capture/nexus-scraper.mjs --slug=SLUG --scrape-only
 *   node bots/nexustoons-akira/capture/nexus-scraper.mjs --slug=SLUG --chapters=1,2,3 --dry-run
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";
import { createAdapter as createNexusAdapter } from "./nexustoons.js";
import { loadConfig } from "../shared/config.js";
import { getHostingAdapter, closeHostingAdapter } from "../hosting/adapter.js";
import { getUploadAdapter, closeUploadAdapter } from "../upload/adapter.js";
import { toStructuredPayload } from "../upload/akira-scan-api.js";
import {
    loadManifest,
    saveManifest,
    markChapter,
    upsertMangaEntry
} from "../shared/manifest.js";
import {
    loadState,
    saveState,
    saveStateImmediate,
    getChapterSkipReason,
    markProcessed,
    rollbackChapterPublication
} from "../shared/state.js";
import { akiraMangaId, akiraCapId } from "../shared/ids.js";
import { log } from "../shared/logger.js";
import { purgeAfterUploadSuccess } from "../shared/page-purge.js";
import { writeJsonAtomic, readJsonFile } from "../../../scripts/lib/chapter-index-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_ROOT = path.join(__dirname, "..");
const REPO_ROOT = path.join(BOT_ROOT, "..", "..");
const CONFIG_MANGAS_PATH = path.join(BOT_ROOT, "config.mangas.json");
const appConfig = loadConfig();

const args = process.argv.slice(2);
const SLUG = args.find((a) => a.startsWith("--slug="))?.split("=")[1]
    || (args.includes("--slug") ? args[args.indexOf("--slug") + 1] : "");
const CHAPTERS_RAW = args.find((a) => a.startsWith("--chapters="))?.split("=")[1]
    || (args.includes("--chapters") ? args[args.indexOf("--chapters") + 1] : "");
const DRY_RUN = args.includes("--dry-run");
const SCRAPE_ONLY = args.includes("--scrape-only");
const INCLUDE_IMAGES = !args.includes("--no-images");

function parseChapterNumbers(raw) {
    if (!raw) return null;
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Atualiza config.mangas.json com entrada do mangá (atómico).
 */
function upsertConfigManga(slug, { akiraId, title }) {
    const config = readJsonFile(CONFIG_MANGAS_PATH, { mangas: [] });
    const idx = config.mangas.findIndex((m) => (m.nexusSlug || m.slug) === slug);
    const entry = {
        nexusSlug: slug,
        akiraId,
        title: title || slug,
        enabled: true
    };
    if (idx >= 0) {
        config.mangas[idx] = { ...config.mangas[idx], ...entry };
    } else {
        config.mangas.push(entry);
    }
    config.updatedAt = new Date().toISOString();
    writeJsonAtomic(CONFIG_MANGAS_PATH, config);
}

/**
 * @param {string} slug
 * @param {{ chapterNumbers?: (string|number)[], includeImages?: boolean, dryRun?: boolean }} [opts]
 * @returns {Promise<{ slug: string, nexusId: string, title: string, chapters: Array<{ id, number, title, imageUrls: string[] }> }>}
 */
export async function scrapeNexusToons(slug, opts = {}) {
    const {
        chapterNumbers = null,
        includeImages = true,
        dryRun = false
    } = opts;

    if (!slug) throw new Error("slug obrigatório");

    const capture = createNexusAdapter();
    try {
        const manga = await capture.getManga(slug);
        let chapters = manga.chapters || [];

        if (chapterNumbers?.length) {
            const wanted = new Set(chapterNumbers.map(String));
            chapters = chapters.filter((ch) => wanted.has(String(ch.number)));
        }

        const result = {
            slug,
            nexusId: manga.id,
            title: manga.title,
            chapters: []
        };

        for (const ch of chapters) {
            const entry = {
                id: ch.id,
                number: ch.number,
                title: ch.title || `Capítulo ${ch.number}`,
                imageUrls: []
            };

            if (includeImages && !dryRun) {
                const mangaId = akiraMangaId(slug, null);
                const capId = akiraCapId(mangaId, ch.number);
                const chapterJson = await capture.captureChapter(slug, ch, { mangaId, capId });
                entry.imageUrls = chapterJson.pages.map((p) => p.url);
            }

            result.chapters.push(entry);
        }

        return result;
    } finally {
        await capture.close?.();
    }
}

/**
 * Executa clean-ghost-chapters para o slug.
 */
async function runGhostCleanup(slug) {
    const script = path.join(REPO_ROOT, "scripts", "clean-ghost-chapters.mjs");
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script, `--slug=${slug}`], {
            stdio: "inherit",
            cwd: REPO_ROOT
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`clean-ghost-chapters exit ${code}`));
        });
    });
}

/**
 * Pipeline completo: scrape → host → upload → state sync → ghost cleanup.
 * @param {string} slug
 * @param {{ chapterNumbers?: (string|number)[], dryRun?: boolean, akiraId?: string }} [opts]
 */
export async function runNexusScraperPipeline(slug, opts = {}) {
    const { chapterNumbers = null, dryRun = false, akiraId: explicitAkiraId = null } = opts;

    if (!slug) throw new Error("slug obrigatório");

    const hostingName = process.env.HOSTING_ADAPTER
        || process.env.NEXUSTOONS_HOSTING_ADAPTER
        || "telegra";
    log.info("=== Nexus Scraper Pipeline ===", { slug, dryRun, hosting: hostingName });

    const manifest = loadManifest();
    const state = loadState();
    const capture = createNexusAdapter();
    const hosting = await getHostingAdapter();
    const upload = await getUploadAdapter();

    let captured = 0;
    let hosted = 0;
    let uploaded = 0;
    let skipped = 0;

    try {
        const manga = await capture.getManga(slug);
        const mangaId = explicitAkiraId || akiraMangaId(slug, null);
        let chapters = manga.chapters || [];

        if (chapterNumbers?.length) {
            const wanted = new Set(chapterNumbers.map(String));
            chapters = chapters.filter((ch) => wanted.has(String(ch.number)));
        }

        upsertConfigManga(slug, { akiraId: mangaId, title: manga.title });
        upsertMangaEntry(manifest, slug, {
            akiraId: mangaId,
            nexusId: manga.id,
            title: manga.title,
            lastChecked: new Date().toISOString()
        });

        const meta = {
            title: manga.title,
            description: manga.description,
            author: manga.author,
            status: manga.status,
            nexusSlug: slug,
            akiraMangaId: mangaId
        };

        for (const ch of chapters) {
            const capId = akiraCapId(mangaId, ch.number);
            const skipInfo = getChapterSkipReason(state, slug, capId, mangaId, ch.number);

            if (skipInfo.skip && !dryRun) {
                log.info(`skip capítulo ${ch.number}`, { slug, source: skipInfo.source });
                skipped++;
                continue;
            }

            const sourceUrl = `${appConfig.nexustoonsBaseUrl}/manga/${slug}/${ch.number}`;
            log.info(`Processando capítulo ${ch.number}`, { slug, capId });

            if (dryRun) {
                markChapter(manifest, slug, ch.number, { capId, captured: false, dryRun: true });
                captured++;
                continue;
            }

            const chapterJson = await capture.captureChapter(slug, ch, { mangaId, capId });
            captured++;

            const hostResult = await hosting.hostChapter(chapterJson, meta);
            if (!hostResult.ok || !hostResult.chapter) {
                markChapter(manifest, slug, ch.number, {
                    capId,
                    captured: true,
                    hosted: false,
                    error: hostResult.error || "hosting falhou"
                });
                log.error(`Hosting falhou capítulo ${ch.number}`, { error: hostResult.error });
                continue;
            }
            hosted++;

            const structured = toStructuredPayload(hostResult.chapter, { ...meta, sourceUrl });
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
                    hosting: hostResult.chapter?.hosting || hostingName,
                    pages: result.pagesSaved
                });
                markProcessed(state, slug, capId, {
                    chapterNumber: String(ch.number),
                    akiraMangaId: mangaId,
                    akiraCapId: capId,
                    nexusChapterId: ch.id,
                    pagesCount: result.pagesSaved
                });
                saveStateImmediate(state);
                purgeAfterUploadSuccess({
                    mangaId,
                    capId,
                    hosting: hostResult.chapter?.hosting || hostingName,
                    pages: hostResult.chapter?.pages || []
                });
                uploaded++;
                log.success(`Capítulo ${ch.number} publicado`, { pages: result.pagesSaved, hosting: hostResult.chapter?.hosting });
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
                log.error(`Upload falhou capítulo ${ch.number}`, { error: result.error });
            }

            await sleep(Math.max(0, Number(process.env.NEXUSTOONS_CHAPTER_DELAY_MS || 800)));
        }

        if (upload.flushDeferredCatalog) {
            upload.flushDeferredCatalog();
        }
        if (!dryRun && uploaded > 0) {
            await upload.finalize?.();
        }

        saveManifest(manifest);
        saveState(state);

        if (!dryRun && (uploaded > 0 || hosted > 0)) {
            try {
                await runGhostCleanup(slug);
            } catch (e) {
                log.warn("Ghost cleanup falhou (não fatal)", { err: e.message });
            }
        }

        return { slug, captured, hosted, uploaded, skipped };
    } finally {
        await capture.close?.();
        await closeHostingAdapter();
        await closeUploadAdapter();
    }
}

async function main() {
    if (!SLUG) {
        console.error("Uso: node capture/nexus-scraper.mjs --slug=SLUG [--scrape-only] [--chapters=1,2] [--dry-run]");
        process.exit(1);
    }

    const chapterNumbers = parseChapterNumbers(CHAPTERS_RAW);

    if (SCRAPE_ONLY) {
        const result = await scrapeNexusToons(SLUG, {
            chapterNumbers,
            includeImages: INCLUDE_IMAGES,
            dryRun: DRY_RUN
        });
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const stats = await runNexusScraperPipeline(SLUG, { chapterNumbers, dryRun: DRY_RUN });
    log.info("Pipeline concluído", stats);
}

const isMain = process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
    main().catch(async (e) => {
        log.error("Nexus scraper falhou", { err: e.message, stack: e.stack });
        await closeHostingAdapter();
        await closeUploadAdapter();
        process.exit(1);
    });
}
