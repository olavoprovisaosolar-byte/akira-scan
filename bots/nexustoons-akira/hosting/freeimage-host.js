/**
 * Hosting Freeimage → iili.io (permanente).
 * Adapter completo: download stream → upload sequencial → HostedChapter.
 */
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/logger.js";
import {
    validateChapter,
    normalizeHostedChapter,
    isLegiblePageUrl
} from "../shared/schema.js";
import {
    downloadProcessPage,
    STREAM_PAGE_CONCURRENCY
} from "../shared/stream-page-processor.mjs";
import { logPageProgress } from "../shared/progress.js";
import { uploadImage, isFreeimageUrl } from "./freeimage.js";

export { uploadImage, isFreeimageUrl };

const cfg = loadConfig();
const PAGE_DELAY_MS = Math.max(0, Number(process.env.FREEIMAGE_DELAY_MS || 400));
const PAGE_DOWNLOAD_CONCURRENCY = STREAM_PAGE_CONCURRENCY;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function extFromUrl(url, fallback = "jpg") {
    const m = String(url).match(/\.(webp|avif|png|jpe?g|gif)(\?|$)/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
    return fallback;
}

/**
 * @param {Array<{index: number, url: string}>} pages
 * @param {{ referer?: string, chapterNumber?: string|number }} [opts]
 */
export async function uploadChapterPages(pages, opts = {}) {
    const referer = opts.referer || "https://nexustoons.com/";
    const sorted = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const hosted = [];
    const failedPages = [];
    const chapterNumber = opts.chapterNumber ?? "?";
    const total = sorted.length;

    for (let batchStart = 0; batchStart < sorted.length; batchStart += PAGE_DOWNLOAD_CONCURRENCY) {
        const batch = sorted.slice(batchStart, batchStart + PAGE_DOWNLOAD_CONCURRENCY);

        for (const p of batch) {
            const batchIdx = batch.indexOf(p);
            const index = p.index ?? batchStart + batchIdx;
            const ext = extFromUrl(p.url);
            const filename = `${String(index + 1).padStart(3, "0")}.${ext}`;

            let cleanup = () => {};
            try {
                const downloaded = await downloadProcessPage(p.url, { referer });
                cleanup = downloaded.cleanup;
                const buffer = downloaded.buffer;
                cleanup();
                cleanup = () => {};

                if (PAGE_DELAY_MS > 0 && hosted.length > 0) await sleep(PAGE_DELAY_MS);
                const url = await uploadImage(buffer, filename);
                hosted.push({ index, url, origem: "freeimage" });
                log.tag("FREEIMAGE", `Upload página ${index + 1}/${sorted.length}`, {
                    url: url.slice(0, 70)
                });
                logPageProgress({
                    chapterNumber,
                    page: index + 1,
                    totalPages: total,
                    fallback: false
                });
            } catch (e) {
                cleanup();
                failedPages.push(index);
                log.error(`Falha página ${index + 1}`, { err: e.message, src: p.url?.slice(0, 80) });
                break;
            }
        }

        if (failedPages.length) break;
    }

    if (failedPages.length || hosted.length !== sorted.length) {
        return {
            ok: false,
            pages: hosted,
            failedPages,
            hostingMode: "freeimage",
            error: failedPages.length
                ? `Falha parcial: páginas ${failedPages.map((n) => n + 1).join(", ")}`
                : `Capítulo incompleto: ${hosted.length}/${sorted.length} páginas`
        };
    }

    return { ok: true, pages: hosted, failedPages: [], hostingMode: "freeimage" };
}

/** @type {import('./adapter.js').HostingAdapter} */
export function createAdapter() {
    return {
        name: "freeimage",

        async hostChapter(chapter, meta = {}) {
            const errors = validateChapter(chapter);
            if (errors.length) {
                return { ok: false, chapter: null, pagesHosted: 0, pagesSkipped: 0, error: errors.join("; ") };
            }

            const referer = meta.nexusSlug
                ? `${cfg.nexustoonsBaseUrl}/manga/${meta.nexusSlug}/${chapter.numero}`
                : `${cfg.nexustoonsBaseUrl}/`;

            log.info("Hospedando capítulo (Freeimage → iili.io)", {
                capId: chapter.capId,
                pages: chapter.pages.length
            });

            const result = await uploadChapterPages(chapter.pages, {
                referer,
                chapterNumber: chapter.numero
            });

            if (!result.ok) {
                return {
                    ok: false,
                    chapter: null,
                    pagesHosted: result.pages.length,
                    pagesSkipped: result.failedPages.length,
                    error: result.error
                };
            }

            const hosted = normalizeHostedChapter({
                ...chapter,
                hosting: "freeimage",
                pages: result.pages
            });

            const bad = (hosted.pages || []).filter((p) => !isLegiblePageUrl(p.url) && !isFreeimageUrl(p.url));
            if (bad.length) {
                return {
                    ok: false,
                    chapter: null,
                    pagesHosted: hosted.pages.length,
                    pagesSkipped: bad.length,
                    error: "URLs Freeimage inválidas após upload"
                };
            }

            return {
                ok: true,
                chapter: hosted,
                pagesHosted: hosted.pages.length,
                pagesSkipped: 0
            };
        }
    };
}
