/**
 * Hosting freeimage.host → CDN iili.io (permanente, sem API key paga).
 * Usado como fallback quando Telegra/Catbox estão bloqueados.
 */
import axios from "axios";
import FormData from "form-data";
import { log } from "../shared/logger.js";
import { validateImageBuffer } from "./telegra.js";

const FREEIMAGE_URL = process.env.FREEIMAGE_UPLOAD_URL || "https://freeimage.host/api/1/upload";
const FREEIMAGE_KEY = process.env.FREEIMAGE_API_KEY || "6d207e02198a847aa98d0a2a901485a5";
const UPLOAD_TIMEOUT_MS = Math.max(5000, Number(process.env.FREEIMAGE_TIMEOUT_MS || 30000));
const BROWSER_UA = process.env.NEXUSTOONS_USER_AGENT
    || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let freeimageBlocked = process.env.FREEIMAGE_SKIP === "1";

export function isFreeimageUrl(url) {
    const u = String(url || "");
    return u.includes("iili.io") || u.includes("freeimage.host");
}

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<string>} URL https://iili.io/...
 */
export async function uploadImage(buffer, filename) {
    if (freeimageBlocked) {
        throw new Error("Freeimage upload bloqueado");
    }

    const check = validateImageBuffer(buffer);
    if (!check.ok) throw new Error(check.error);

    const ext = String(filename).match(/\.(\w+)$/)?.[1] || "jpg";
    const safeName = String(filename).replace(/[^\w.-]/g, "_").slice(0, 64) || `page.${ext}`;

    const form = new FormData();
    form.append("source", buffer, {
        filename: safeName,
        contentType: ext === "png" ? "image/png" : "image/jpeg"
    });
    form.append("type", "file");
    form.append("action", "upload");
    form.append("key", FREEIMAGE_KEY);

    const res = await axios.post(FREEIMAGE_URL, form, {
        headers: {
            ...form.getHeaders(),
            "User-Agent": BROWSER_UA
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: UPLOAD_TIMEOUT_MS,
        validateStatus: () => true
    });

    const url = res.data?.image?.url || res.data?.image?.display_url || res.data?.url;
    if (res.status >= 400 || !url) {
        const detail = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        if (res.status === 429 || String(detail).includes("limit")) {
            freeimageBlocked = true;
            log.warn("Freeimage rate-limit — bloqueado nesta sessão");
        }
        throw new Error(`Freeimage HTTP ${res.status}: ${String(detail).slice(0, 160)}`);
    }

    return String(url).trim();
}
