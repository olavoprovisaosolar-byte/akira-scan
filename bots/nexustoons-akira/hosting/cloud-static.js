/**
 * Hosting cloud-static — download paralelo + gravação direta em data/cloud/pages/.
 * Sem módulo Telegra (zero tentativas de upload remoto).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/logger.js";
import { validateChapter, normalizeHostedChapter, isLegiblePageUrl } from "../shared/schema.js";
import { validateAndPrepareImage } from "../shared/image-hygiene.js";
import { downloadProcessPage, STREAM_PAGE_CONCURRENCY } from "../shared/stream-page-processor.mjs";
import { logPageProgress } from "../shared/progress.js";
import {
    publishApiEnabled,
    publishApiBaseUrl,
    publishChapterPages
} from "../../../scripts/cloud/publish-client.mjs";
import { pageApiUrl } from "../../../scripts/cloud/cloud-api-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
const STATIC_PAGES_ROOT = path.join(ROOT, "data", "cloud", "pages");

const cfg = loadConfig();
const MIN_BYTES = Number(process.env.TELEGRA_MIN_BYTES || 100);

const PAGE_DOWNLOAD_CONCURRENCY = STREAM_PAGE_CONCURRENCY;

function extFromUrl(url, fallback = "jpg") {
    const m = String(url).match(/\.(webp|avif|png|jpe?g|gif)(\?|$)/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
    return fallback;
}

export function validateImageBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        return { ok: false, error: "buffer inválido" };
    }
    if (buffer.byteLength < MIN_BYTES) {
        return { ok: false, error: `imagem corrompida (${buffer.byteLength} bytes < ${MIN_BYTES})` };
    }
    if (buffer.byteLength > Number(process.env.TELEGRA_MAX_BYTES || 5 * 1024 * 1024)) {
        return { ok: false, error: "arquivo excede limite" };
    }
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isGif = buffer[0] === 0x47 && buffer[1] === 0x49;
    const isWebp = buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45;
    const isAvif = buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74;
    if (!isJpeg && !isPng && !isGif && !isWebp && !isAvif) {
        return { ok: false, error: "magic bytes inválidos" };
    }
    return { ok: true };
}

function apiPageUrl(mangaId, capId, pageIndex) {
    const base = publishApiBaseUrl(cfg.akiraScanBaseUrl);
    return pageApiUrl(base, mangaId, capId, pageIndex + 1);
}

function saveStaticPage(buffer, filenameExt, mangaId, capId, pageIndex) {
    const dir = path.join(STATIC_PAGES_ROOT, mangaId, capId);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${String(pageIndex + 1).padStart(3, "0")}.${filenameExt}`;
    fs.writeFileSync(path.join(dir, name), buffer);
    const base = cfg.akiraScanBaseUrl.replace(/\/$/, "");
    return `${base}/data/cloud/pages/${mangaId}/${capId}/${name}`;
}

/**
 * @param {Array<{index: number, url: string}>} pages
 * @param {{ referer?: string, mangaId?: string, capId?: string, chapterNumber?: string|number }} [opts]
 */
export async function uploadChapterPages(pages, opts = {}) {
    const referer = opts.referer || "https://nexustoons.com/";
    const sorted = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const failedPages = [];
    const chapterNumber = opts.chapterNumber ?? "?";
    const total = sorted.length;
    const useApi = publishApiEnabled();
    const pageFiles = [];
    const hosted = [];

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
                const prepared = await validateAndPrepareImage(buffer, downloaded.ext || ext);
                cleanup();
                cleanup = () => {};
                if (useApi) {
                    pageFiles.push({
                        index,
                        ext: prepared.ext,
                        buffer: prepared.buffer,
                        filename: `${String(index + 1).padStart(3, "0")}.${prepared.ext}`
                    });
                    hosted.push({ index, url: apiPageUrl(opts.mangaId, opts.capId, index), origem: "r2-api" });
                } else {
                    const url = saveStaticPage(
                        prepared.buffer,
                        prepared.ext,
                        opts.mangaId,
                        opts.capId,
                        index
                    );
                    hosted.push({ index, url, origem: "cloud-static" });
                }
                logPageProgress({
                    chapterNumber,
                    page: index + 1,
                    totalPages: total,
                    fallback: true
                });
            } catch (e) {
                cleanup();
                failedPages.push(index);
                log.error(`Falha ao salvar página ${index + 1}`, { err: e.message, src: p.url?.slice(0, 80) });
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
            hostingMode: useApi ? "r2" : "cloud-static",
            error: failedPages.length
                ? `Falha parcial: páginas ${failedPages.map((n) => n + 1).join(", ")}`
                : `Capítulo incompleto: ${hosted.length}/${sorted.length} páginas`
        };
    }

    if (useApi && pageFiles.length) {
        try {
            const baseUrl = publishApiBaseUrl(cfg.akiraScanBaseUrl);
            const token = process.env.AKIRA_PUBLISH_TOKEN;
            const published = await publishChapterPages({
                baseUrl,
                token,
                chapter: {
                    mangaId: opts.mangaId,
                    capId: opts.capId,
                    numero: opts.chapterNumber,
                    titulo: opts.titulo || null,
                    hosting: "r2"
                },
                pageFiles
            });
            return {
                ok: true,
                pages: published.pages || hosted,
                failedPages: [],
                hostingMode: "r2"
            };
        } catch (e) {
            log.error("Falha ao publicar capítulo na API R2", { err: e.message });
            return {
                ok: false,
                pages: hosted,
                failedPages: [],
                hostingMode: "r2",
                error: e.message
            };
        }
    }

    return { ok: true, pages: hosted, failedPages: [], hostingMode: useApi ? "r2" : "cloud-static" };
}

/** @type {import('./adapter.js').HostingAdapter} */
export function createAdapter() {
    return {
        name: "cloud-static",

        async hostChapter(chapter, meta = {}) {
            const errors = validateChapter(chapter);
            if (errors.length) {
                return { ok: false, chapter: null, pagesHosted: 0, pagesSkipped: 0, error: errors.join("; ") };
            }

            const referer = meta.nexusSlug
                ? `${cfg.nexustoonsBaseUrl}/manga/${meta.nexusSlug}/${chapter.numero}`
                : `${cfg.nexustoonsBaseUrl}/`;

            const total = chapter.pages.length;
            log.info("Hospedando capítulo (cloud-static direto)", {
                capId: chapter.capId,
                pages: total,
                downloadConcurrency: PAGE_DOWNLOAD_CONCURRENCY,
                apiPublish: publishApiEnabled()
            });

            const result = await uploadChapterPages(chapter.pages, {
                referer,
                mangaId: chapter.mangaId,
                capId: chapter.capId,
                chapterNumber: chapter.numero,
                titulo: chapter.titulo
            });

            if (!result.ok) {
                return {
                    ok: false,
                    chapter: null,
                    pagesHosted: result.pages.length,
                    pagesSkipped: total - result.pages.length,
                    error: result.error
                };
            }

            const hosted = normalizeHostedChapter({
                ...chapter,
                pages: result.pages,
                hosting: result.hostingMode || "cloud-static",
                hostedAt: new Date().toISOString()
            });

            const allLegible = result.pages.every((p) => isLegiblePageUrl(p.url));
            if (!allLegible) {
                return {
                    ok: false,
                    chapter: null,
                    pagesHosted: 0,
                    pagesSkipped: total,
                    error: "URLs hospedadas inválidas após gravação estática"
                };
            }

            log.info("Capítulo hospedado", { capId: chapter.capId, pages: result.pages.length, hosting: "cloud-static" });

            return {
                ok: true,
                chapter: hosted,
                pagesHosted: result.pages.length,
                pagesSkipped: 0
            };
        }
    };
}
