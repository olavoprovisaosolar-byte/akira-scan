/**
 * Processamento de páginas em stream — RAM baixa (<150 MB).
 * Download axios stream → temp → sharp validate/convert → buffer final.
 * Concorrência 1–2; purge imediato dos temps após uso.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import axios from "axios";
import { withExponentialBackoff } from "./retry.js";
import { basicMagicCheck } from "./image-hygiene.js";

const MAX_BYTES = Number(process.env.TELEGRA_MAX_BYTES || 5 * 1024 * 1024);
const BROWSER_UA = process.env.NEXUSTOONS_USER_AGENT
    || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Concorrência máxima 2 para manter RAM sob controle. */
export const STREAM_PAGE_CONCURRENCY = Math.min(
    2,
    Math.max(1, Number(
        process.env.STREAM_PAGE_CONCURRENCY
        || process.env.PAGE_DOWNLOAD_CONCURRENCY
        || 1
    ))
);

let sharpMod = null;
let sharpCacheOff = false;

async function getSharp() {
    if (sharpMod !== null) return sharpMod;
    try {
        const sharp = (await import("sharp")).default;
        if (!sharpCacheOff) {
            sharp.cache(false);
            sharpCacheOff = true;
        }
        sharpMod = sharp;
    } catch {
        sharpMod = false;
    }
    return sharpMod;
}

function extFromUrl(url, fallback = "jpg") {
    const m = String(url).match(/\.(webp|avif|png|jpe?g|gif)(\?|$)/i);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
    return fallback;
}

function makeTempPath(prefix, ext) {
    return path.join(os.tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

/** Remove ficheiros temporários (ignora erros). */
export function purgeTempFiles(paths) {
    for (const fp of paths || []) {
        try {
            if (fp && fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch { /* ignore */ }
    }
}

/**
 * Download via stream para ficheiro temp (sem arraybuffer).
 * @returns {Promise<string>} caminho do ficheiro temp
 */
async function streamDownloadToFile(url, referer) {
    const rawPath = makeTempPath("nexus-raw", "bin");
    let bytes = 0;

    await withExponentialBackoff(async () => {
        const res = await axios.get(url, {
            responseType: "stream",
            timeout: 60000,
            maxContentLength: MAX_BYTES + 1024,
            headers: {
                "User-Agent": BROWSER_UA,
                Referer: referer || "https://nexustoons.com/"
            },
            validateStatus: () => true
        });

        if (res.status >= 400) {
            const err = new Error(`download HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }

        await pipeline(res.data, createWriteStream(rawPath));
        bytes = fs.statSync(rawPath).size;
        if (bytes > MAX_BYTES) {
            purgeTempFiles([rawPath]);
            throw new Error(`arquivo ${bytes} bytes excede limite (${MAX_BYTES})`);
        }
        if (bytes < Number(process.env.TELEGRA_MIN_BYTES || 100)) {
            purgeTempFiles([rawPath]);
            throw new Error(`imagem inválida (${bytes} bytes)`);
        }
    }, {
        onRetry: (attempt, delayMs, e) => {
            purgeTempFiles([rawPath]);
        }
    });

    return rawPath;
}

/**
 * Valida e converte imagem temp → buffer JPEG/PNG pronto para upload.
 * @param {string} rawPath
 * @param {string} extHint
 * @returns {Promise<{ buffer: Buffer, ext: string, contentType: string, tempPaths: string[] }>}
 */
async function processTempFile(rawPath, extHint) {
    const tempPaths = [rawPath];
    const rawBuffer = fs.readFileSync(rawPath);
    const basic = basicMagicCheck(rawBuffer);
    if (!basic.ok) {
        purgeTempFiles(tempPaths);
        throw new Error(basic.error);
    }

    const normalized = extHint === "jpeg" ? "jpg" : extHint.toLowerCase();
    const sharp = await getSharp();
    const needsJpeg = normalized === "avif" || normalized === "webp";

    if (sharp) {
        try {
            const meta = await sharp(rawPath).metadata();
            if (!meta.width || !meta.height || meta.width < 10 || meta.height < 10) {
                throw new Error(`dimensões inválidas (${meta.width}x${meta.height})`);
            }
        } catch (e) {
            purgeTempFiles(tempPaths);
            throw new Error(`integridade sharp falhou: ${e.message}`);
        }

        if (needsJpeg) {
            const outPath = makeTempPath("nexus-out", "jpg");
            tempPaths.push(outPath);
            await sharp(rawPath).jpeg({ quality: 90 }).toFile(outPath);
            const buffer = fs.readFileSync(outPath);
            const recheck = basicMagicCheck(buffer);
            if (!recheck.ok) {
                purgeTempFiles(tempPaths);
                throw new Error(recheck.error);
            }
            return { buffer, ext: "jpg", contentType: "image/jpeg", tempPaths };
        }
    }

    const mimeMap = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp"
    };
    return {
        buffer: rawBuffer,
        ext: normalized,
        contentType: mimeMap[normalized] || "image/jpeg",
        tempPaths
    };
}

/**
 * Download stream + validate/convert — uma página por vez na RAM.
 * @param {string} url
 * @param {{ referer?: string }} [opts]
 * @returns {Promise<{ buffer: Buffer, ext: string, contentType: string, cleanup: () => void }>}
 */
export async function downloadProcessPage(url, opts = {}) {
    const extHint = extFromUrl(url);
    const rawPath = await streamDownloadToFile(url, opts.referer);
    const processed = await processTempFile(rawPath, extHint);
    const cleanup = () => purgeTempFiles(processed.tempPaths);
    return {
        buffer: processed.buffer,
        ext: processed.ext,
        contentType: processed.contentType,
        cleanup
    };
}

/**
 * Processa páginas com concorrência limitada (1–2).
 * @template T
 * @param {Array<{ index?: number, url: string }>} pages
 * @param {(page: { index: number, url: string }, i: number) => Promise<T>} fn
 * @param {number} [concurrency]
 */
export async function mapPagesSequential(pages, fn, concurrency = STREAM_PAGE_CONCURRENCY) {
    const sorted = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const results = [];

    for (let i = 0; i < sorted.length; i += concurrency) {
        const batch = sorted.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map((p, batchIdx) => {
                const index = p.index ?? i + batchIdx;
                return fn({ ...p, index }, index);
            })
        );
        results.push(...batchResults);
    }

    return results;
}
