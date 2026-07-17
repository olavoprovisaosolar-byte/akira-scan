/**
 * Hosting Telegra.ph — upload sequencial síncrono por capítulo.
 *
 * Endpoints (em ordem):
 *   1. TELEGRA_UPLOAD_URL / config (padrão https://api.telegra.ph/upload)
 *   2. https://telegra.ph/upload (legado)
 *   3. https://graph.org/upload (mirror)
 *
 * Fallback: hospedagem estática em data/cloud/pages/ (Telegra descontinuou upload em set/2024).
 * URLs finais: https://akira-scan.pages.dev/data/cloud/pages/{mangaId}/{capId}/001.jpg
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import FormData from "form-data";
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/logger.js";
import { validateChapter, normalizeHostedChapter, isLegiblePageUrl } from "../shared/schema.js";
import { withExponentialBackoff } from "../shared/retry.js";
import { validateAndPrepareImage } from "../shared/image-hygiene.js";
import { downloadProcessPage, mapPagesSequential, STREAM_PAGE_CONCURRENCY } from "../shared/stream-page-processor.mjs";
import { logPageProgress } from "../shared/progress.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
const STATIC_PAGES_ROOT = path.join(ROOT, "data", "cloud", "pages");

const cfg = loadConfig();

function envTruthy(name) {
    const v = String(process.env[name] ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}

const MAX_BYTES = Number(process.env.TELEGRA_MAX_BYTES || 5 * 1024 * 1024);
const RETRIES = Math.max(1, Number(process.env.TELEGRA_RETRIES || 3));
const RETRY_DELAY_MS = Math.max(0, Number(process.env.TELEGRA_RETRY_DELAY_MS || 2000));
const MIN_BYTES = Number(process.env.TELEGRA_MIN_BYTES || 100);
const UPLOAD_TIMEOUT_MS = Math.max(5000, Number(process.env.TELEGRA_UPLOAD_TIMEOUT_MS || 15000));
const STATIC_FALLBACK = process.env.TELEGRA_STATIC_FALLBACK !== "false";
const SKIP_TELEGRA = envTruthy("TELEGRA_SKIP");
const BROWSER_UA = process.env.NEXUSTOONS_USER_AGENT
    || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PAGE_DOWNLOAD_CONCURRENCY = STREAM_PAGE_CONCURRENCY;

function pageDelayMs() {
    if (SKIP_TELEGRA || telegraBlocked) return 0;
    return Math.max(0, Number(process.env.TELEGRA_DELAY_MS ?? 600));
}

/** Após HTTP 400 (ou TELEGRA_SKIP), Telegra está bloqueado — pula tentativas seguintes. */
let telegraBlocked = SKIP_TELEGRA;
let loggedStaticMode = false;

function markTelegraBlocked(reason = "auto-detect") {
    if (telegraBlocked) return;
    telegraBlocked = true;
    if (!loggedStaticMode) {
        loggedStaticMode = true;
        log.info("Telegra pulado — modo cloud-static", {
            reason: SKIP_TELEGRA ? "TELEGRA_SKIP" : reason
        });
    }
}

if (SKIP_TELEGRA) {
    markTelegraBlocked("TELEGRA_SKIP");
}

const DEFAULT_UPLOAD_URLS = [
    "https://api.telegra.ph/upload",
    "https://telegra.ph/upload",
    "https://graph.org/upload"
];

function uploadEndpoints() {
    const primary = cfg.telegraUploadUrl || DEFAULT_UPLOAD_URLS[0];
    const extras = DEFAULT_UPLOAD_URLS.filter((u) => u !== primary);
    return [primary, ...extras];
}

function buildUploadForm(buffer, uploadName, contentType) {
    const form = new FormData();
    form.append("file", buffer, {
        filename: uploadName,
        contentType
    });
    return form;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function extFromUrl(url, fallback = "jpg") {
    const m = String(url).match(/\.(webp|avif|png|jpe?g|gif)(\?|$)/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
    return fallback;
}

function mimeFromExt(ext) {
    const map = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp"
    };
    return map[ext] || "image/jpeg";
}

const TELEGRA_EXTS = new Set(["jpg", "jpeg", "png", "gif"]);

/** Valida buffer de imagem por tamanho mínimo e magic bytes. */
export function validateImageBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        return { ok: false, error: "buffer inválido" };
    }
    if (buffer.byteLength < MIN_BYTES) {
        return { ok: false, error: `imagem corrompida (${buffer.byteLength} bytes < ${MIN_BYTES})` };
    }
    if (buffer.byteLength > MAX_BYTES) {
        return { ok: false, error: `arquivo ${buffer.byteLength} bytes excede limite Telegra (${MAX_BYTES})` };
    }

    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    const isAvif = buffer.length >= 12
        && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;

    if (!isJpeg && !isPng && !isGif && !isWebp && !isAvif) {
        return { ok: false, error: "magic bytes inválidos — imagem corrompida ou formato desconhecido" };
    }

    return { ok: true };
}

async function loadSharp() {
    try {
        return (await import("sharp")).default;
    } catch {
        return null;
    }
}

async function prepareUploadBuffer(buffer, ext) {
    const prepared = await validateAndPrepareImage(buffer, ext);
    return {
        buffer: prepared.buffer,
        filenameExt: prepared.ext,
        contentType: prepared.contentType
    };
}

function parseTelegraUploadResponse(data, uploadUrl) {
    if (data?.ok === false && data?.error) {
        throw new Error(`Telegra API: ${data.error}`);
    }

    const parsed = Array.isArray(data) ? data : [data];
    const entry = parsed[0];
    const src = entry?.src || entry?.path || entry?.url;
    if (!src) {
        throw new Error(`Telegra sem src: ${JSON.stringify(data).slice(0, 200)}`);
    }

    if (src.startsWith("http")) return src;

    const base = uploadUrl.includes("graph.org")
        ? "https://graph.org"
        : "https://telegra.ph";
    return `${base}${src.startsWith("/") ? "" : "/"}${src}`;
}

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} [uploadUrl]
 * @returns {Promise<string>} URL https://telegra.ph/file/...
 */
export async function uploadImage(buffer, filename, uploadUrl = cfg.telegraUploadUrl) {
    if (telegraBlocked) {
        throw new Error("Telegra upload bloqueado (HTTP 400 — use fallback estático)");
    }

    const check = validateImageBuffer(buffer);
    if (!check.ok) throw new Error(check.error);

    const ext = extFromUrl(filename, extFromUrl(`x.${filename.split(".").pop()}`, "jpg"));
    const prepared = await prepareUploadBuffer(buffer, ext);
    const safeName = filename.replace(/[^\w.-]/g, "_").slice(0, 64) || `page.${prepared.filenameExt}`;
    const uploadName = safeName.replace(/\.[^.]+$/, `.${prepared.filenameExt}`);

    const endpoints = uploadUrl
        ? [uploadUrl, ...uploadEndpoints().filter((u) => u !== uploadUrl)]
        : uploadEndpoints();
    let lastErr = null;

    for (const endpoint of endpoints) {
        try {
            const origin = endpoint.includes("graph.org")
                ? "https://graph.org"
                : "https://telegra.ph";
            const attemptForm = buildUploadForm(prepared.buffer, uploadName, prepared.contentType);
            const url = await withExponentialBackoff(async () => {
                const res = await axios.post(endpoint, attemptForm, {
                    headers: {
                        ...attemptForm.getHeaders(),
                        "User-Agent": BROWSER_UA,
                        Referer: `${origin}/`,
                        Origin: origin
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    timeout: UPLOAD_TIMEOUT_MS,
                    validateStatus: () => true
                });

                if (res.status >= 400) {
                    const detail = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
                    const err = new Error(`Telegra HTTP ${res.status}: ${String(detail).slice(0, 200)}`);
                    err.status = res.status;
                    if (res.status === 400) markTelegraBlocked("HTTP 400");
                    throw err;
                }

                return parseTelegraUploadResponse(res.data, endpoint);
            }, {
                onRetry: (attempt, delayMs, e) => {
                    if (e.status === 400) throw e;
                    log.warn(`Retry Telegra upload (429/503)`, { endpoint, attempt, delayMs });
                }
            });
            return url;
        } catch (e) {
            lastErr = e;
            if (e.status === 400 || telegraBlocked) break;
            log.warn(`Endpoint ${endpoint} falhou`, { err: e.message });
        }
    }

    throw lastErr || new Error("Todos os endpoints Telegra falharam");
}

function saveStaticPage(buffer, filenameExt, mangaId, capId, pageIndex) {
    const dir = path.join(STATIC_PAGES_ROOT, mangaId, capId);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${String(pageIndex + 1).padStart(3, "0")}.${filenameExt}`;
    fs.writeFileSync(path.join(dir, name), buffer);
    const base = cfg.akiraScanBaseUrl.replace(/\/$/, "");
    return `${base}/data/cloud/pages/${mangaId}/${capId}/${name}`;
}

async function uploadWithRetry(buffer, filename, pageIndex, staticOpts = null, progressCtx = null) {
    const useStaticSilent = telegraBlocked && STATIC_FALLBACK && staticOpts?.mangaId && staticOpts?.capId;

    if (useStaticSilent) {
        const ext = extFromUrl(filename, "jpg");
        const prepared = await prepareUploadBuffer(buffer, ext);
        const url = saveStaticPage(prepared.buffer, prepared.filenameExt, staticOpts.mangaId, staticOpts.capId, pageIndex);
        return { url, origem: "cloud-static" };
    }

    let lastErr = null;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                log.warn(`Retry Telegra página ${pageIndex + 1}`, { attempt, max: RETRIES });
                await sleep(RETRY_DELAY_MS);
            }
            const url = await uploadImage(buffer, filename);
            return { url, origem: "telegra" };
        } catch (e) {
            lastErr = e;
            if (e.status === 400 || String(e.message).includes("HTTP 400")) {
                markTelegraBlocked("HTTP 400");
                break;
            }
            if (telegraBlocked) break;
            log.error(`Falha no upload da página ${pageIndex + 1} (tentativa ${attempt}/${RETRIES})`, { err: e.message });
        }
    }

    if (STATIC_FALLBACK && staticOpts?.mangaId && staticOpts?.capId) {
        markTelegraBlocked("auto-detect");
        const ext = extFromUrl(filename, "jpg");
        const prepared = await prepareUploadBuffer(buffer, ext);
        const url = saveStaticPage(prepared.buffer, prepared.filenameExt, staticOpts.mangaId, staticOpts.capId, pageIndex);
        return { url, origem: "cloud-static" };
    }

    throw lastErr || new Error(`upload da página ${pageIndex + 1} falhou após ${RETRIES} tentativas`);
}

/**
 * Download em lotes (concorrência PAGE_DOWNLOAD_CONCURRENCY), upload sequencial por página.
 * @param {Array<{index: number, url: string}>} pages
 * @param {{ referer?: string, mangaId?: string, capId?: string, chapterNumber?: string|number }} [opts]
 */
export async function uploadChapterPages(pages, opts = {}) {
    const referer = opts.referer || "https://nexustoons.com/";
    const sorted = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const hosted = [];
    const failedPages = [];
    let hostingMode = "telegra";
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

                const delay = pageDelayMs();
                if (delay > 0 && hosted.length > 0) await sleep(delay);
                const result = await uploadWithRetry(buffer, filename, index, {
                    mangaId: opts.mangaId,
                    capId: opts.capId
                }, { chapterNumber, page: index + 1, totalPages: total });

                if (result.origem === "cloud-static") hostingMode = "cloud-static";

                hosted.push({ index, url: result.url, origem: result.origem });
                logPageProgress({
                    chapterNumber,
                    page: index + 1,
                    totalPages: total,
                    fallback: result.origem !== "telegra"
                });
            } catch (e) {
                cleanup();
                failedPages.push(index);
                log.error(`Falha no upload da página ${index + 1}`, { err: e.message, src: p.url?.slice(0, 80) });
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
        name: "telegra",

        async hostChapter(chapter, meta = {}) {
            const errors = validateChapter(chapter);
            if (errors.length) {
                return { ok: false, chapter: null, pagesHosted: 0, pagesSkipped: 0, error: errors.join("; ") };
            }

            const referer = meta.nexusSlug
                ? `${cfg.nexustoonsBaseUrl}/manga/${meta.nexusSlug}/${chapter.numero}`
                : `${cfg.nexustoonsBaseUrl}/`;

            const total = chapter.pages.length;
            log.info(telegraBlocked
                ? "Hospedando capítulo (cloud-static direto)"
                : "Hospedando capítulo (sequencial Telegra → fallback estático)", {
                capId: chapter.capId,
                pages: total,
                downloadConcurrency: PAGE_DOWNLOAD_CONCURRENCY
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
                    pagesSkipped: total - result.pages.length,
                    error: result.error
                };
            }

            const hosting = result.hostingMode || "telegra";
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
                    pagesSkipped: total,
                    error: "URLs hospedadas inválidas após upload"
                };
            }

            log.info("Capítulo hospedado", { capId: chapter.capId, pages: result.pages.length, hosting });

            return {
                ok: true,
                chapter: hosted,
                pagesHosted: result.pages.length,
                pagesSkipped: 0
            };
        }
    };
}
