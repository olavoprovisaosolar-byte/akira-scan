/**
 * Hosting catbox.moe — upload anônimo (sem API key).
 * POST https://catbox.moe/user/api.php  reqtype=fileupload + fileToUpload
 *
 * Se catbox bloquear o IP (HTTP 412), cai no fallback estático em data/cloud/pages/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import FormData from "form-data";
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/logger.js";
import {
    validateChapter,
    normalizeHostedChapter,
    isLegiblePageUrl
} from "../shared/schema.js";
import {
    validateImageBuffer
} from "./telegra.js";
import {
    downloadProcessPage,
    STREAM_PAGE_CONCURRENCY
} from "../shared/stream-page-processor.mjs";
import { logPageProgress } from "../shared/progress.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
const STATIC_PAGES_ROOT = path.join(ROOT, "data", "cloud", "pages");

const cfg = loadConfig();
const CATBOX_URL = process.env.CATBOX_UPLOAD_URL || "https://catbox.moe/user/api.php";
const UPLOAD_TIMEOUT_MS = Math.max(5000, Number(process.env.CATBOX_UPLOAD_TIMEOUT_MS || 60000));
const PAGE_DELAY_MS = Math.max(0, Number(process.env.CATBOX_DELAY_MS || 800));
const STATIC_FALLBACK = process.env.CATBOX_STATIC_FALLBACK !== "false";
const PAGE_DOWNLOAD_CONCURRENCY = STREAM_PAGE_CONCURRENCY;
const BROWSER_UA = process.env.NEXUSTOONS_USER_AGENT
    || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Após HTTP 412, catbox bloqueou este IP — pula tentativas seguintes. */
let catboxBlocked = process.env.CATBOX_SKIP === "true";

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function extFromUrl(url, fallback = "jpg") {
    const m = String(url).match(/\.(webp|avif|png|jpe?g|gif)(\?|$)/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
    return fallback;
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
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<string>} URL https://files.catbox.moe/...
 */
export async function uploadImage(buffer, filename) {
    if (catboxBlocked) {
        throw new Error("Catbox upload bloqueado (HTTP 412 — use fallback estático)");
    }

    const check = validateImageBuffer(buffer);
    if (!check.ok) throw new Error(check.error);

    const ext = extFromUrl(filename, "jpg");
    const safeName = filename.replace(/[^\w.-]/g, "_").slice(0, 64) || `page.${ext}`;

    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buffer, {
        filename: safeName,
        contentType: ext === "png" ? "image/png" : "image/jpeg"
    });

    const res = await axios.post(CATBOX_URL, form, {
        headers: {
            ...form.getHeaders(),
            "User-Agent": BROWSER_UA,
            Referer: "https://catbox.moe/",
            Origin: "https://catbox.moe"
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: UPLOAD_TIMEOUT_MS,
        validateStatus: () => true
    });

    const body = String(res.data || "").trim();
    if (res.status >= 400 || body.startsWith("Error") || body.includes("Invalid")) {
        if (res.status === 412 || body.includes("Invalid uploader")) catboxBlocked = true;
        throw new Error(`Catbox HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    if (!body.startsWith("http")) {
        throw new Error(`Catbox resposta inválida: ${body.slice(0, 200)}`);
    }

    return body;
}

async function uploadWithFallback(buffer, filename, pageIndex, staticOpts) {
    try {
        const url = await uploadImage(buffer, filename);
        return { url, origem: "catbox" };
    } catch (e) {
        log.warn(`Catbox falhou página ${pageIndex + 1}`, { err: e.message });
        if (!STATIC_FALLBACK || !staticOpts?.mangaId || !staticOpts?.capId) throw e;
        const ext = extFromUrl(filename, "jpg");
        const url = saveStaticPage(buffer, ext, staticOpts.mangaId, staticOpts.capId, pageIndex);
        log.tag("CATBOX", `Fallback estático página ${pageIndex + 1}`, { url: url.slice(0, 80) });
        return { url, origem: "cloud-static" };
    }
}

/**
 * Download stream (concorrência 1–2) + upload sequencial catbox.
 * @param {Array<{index: number, url: string}>} pages
 * @param {{ referer?: string, mangaId?: string, capId?: string, chapterNumber?: string|number }} [opts]
 */
export async function uploadChapterPages(pages, opts = {}) {
    const referer = opts.referer || "https://nexustoons.com/";
    const sorted = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const hosted = [];
    const failedPages = [];
    let hostingMode = "catbox";
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
                const result = await uploadWithFallback(buffer, filename, index, {
                    mangaId: opts.mangaId,
                    capId: opts.capId
                });
                if (result.origem === "cloud-static") hostingMode = "cloud-static";
                hosted.push({ index, url: result.url, origem: result.origem });
                log.tag("CATBOX", `Upload página ${index + 1}/${sorted.length}`, {
                    url: result.url.slice(0, 60),
                    origem: result.origem
                });
                logPageProgress({
                    chapterNumber,
                    page: index + 1,
                    totalPages: total,
                    fallback: result.origem !== "catbox"
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
            hostingMode,
            error: failedPages.length
                ? `Falha parcial: páginas ${failedPages.map((n) => n + 1).join(", ")}`
                : `Capítulo incompleto: ${hosted.length}/${sorted.length} páginas`
        };
    }

    return { ok: true, pages: hosted, failedPages: [], hostingMode };
}

/** @type {import('./adapter.js').HostingAdapter} */
export function createAdapter() {
    return {
        name: "catbox",

        async hostChapter(chapter, meta = {}) {
            const errors = validateChapter(chapter);
            if (errors.length) {
                return { ok: false, chapter: null, pagesHosted: 0, pagesSkipped: 0, error: errors.join("; ") };
            }

            const referer = meta.nexusSlug
                ? `${cfg.nexustoonsBaseUrl}/manga/${meta.nexusSlug}/${chapter.numero}`
                : `${cfg.nexustoonsBaseUrl}/`;

            log.info("Hospedando capítulo (catbox → fallback estático)", {
                capId: chapter.capId,
                pages: chapter.pages.length
            });

            const result = await uploadChapterPages(chapter.pages, {
                referer,
                mangaId: chapter.mangaId,
                capId: chapter.capId,
                chapterNumber: chapter.numero
            });

            if (!result.ok) {
                return {
                    ok: false,
                    chapter: null,
                    pagesHosted: result.pages.length,
                    pagesSkipped: chapter.pages.length - result.pages.length,
                    error: result.error
                };
            }

            const hosting = result.hostingMode || "catbox";
            const hosted = normalizeHostedChapter({
                ...chapter,
                pages: result.pages,
                hosting,
                hostedAt: new Date().toISOString()
            });

            const allLegible = result.pages.every((p) => isLegiblePageUrl(p.url));
            if (!allLegible) {
                return {
                    ok: false,
                    chapter: null,
                    pagesHosted: 0,
                    pagesSkipped: chapter.pages.length,
                    error: "URLs hospedadas inválidas após upload"
                };
            }

            return {
                ok: true,
                chapter: hosted,
                pagesHosted: result.pages.length,
                pagesSkipped: 0
            };
        }
    };
}
