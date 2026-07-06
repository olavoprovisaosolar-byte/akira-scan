/**
 * Cliente HTTP seguro — emula Chrome/Win11, bloqueia redirects cross-domain.
 * Corrige redirect toonlivre.net → www.mangalivre.net (DNS inválido).
 */
import axios from "axios";
import { logger } from "../../core/logger.js";
export const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export function browserHeaders(referer, extra = {}) {
    return {
        "User-Agent": CHROME_UA,
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        ...(referer ? { Referer: referer } : {}),
        ...extra
    };
}
function sameOriginRedirect(baseUrl, location) {
    try {
        const base = new URL(baseUrl);
        const target = new URL(location, baseUrl);
        return base.hostname === target.hostname;
    }
    catch {
        return false;
    }
}
const client = axios.create({
    timeout: 30_000,
    maxRedirects: 0,
    validateStatus: (s) => s < 500
});
export async function fetchText(url, opts = {}) {
    let current = url;
    const maxHops = opts.maxHops ?? 3;
    for (let hop = 0; hop <= maxHops; hop++) {
        const config = {
            headers: browserHeaders(opts.referer || current, opts.headers),
            responseType: "text"
        };
        const res = await client.get(current, config);
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
            const loc = res.headers.location;
            if (!opts.allowRedirects && !sameOriginRedirect(current, loc)) {
                logger.warn("SecureClient", `Redirect cross-domain bloqueado: ${current} → ${loc}`);
                throw new Error(`Redirect bloqueado para domínio externo (${loc})`);
            }
            if (hop >= maxHops)
                throw new Error("Muitos redirects.");
            current = new URL(loc, current).href;
            continue;
        }
        if (res.status >= 400) {
            throw new Error(`HTTP ${res.status} — ${current}`);
        }
        return res.data;
    }
    throw new Error("fetchText esgotou redirects.");
}
export async function fetchJson(url, opts = {}) {
    const text = await fetchText(url, { ...opts, headers: { ...opts.headers, Accept: "application/json,*/*" } });
    return JSON.parse(text);
}
