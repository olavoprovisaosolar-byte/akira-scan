/**
 * Handler HTTP do proxy — schema canônico + cache Firestore 24h.
 */
import { fetchMangaAuto, fetchChapterAuto } from "./registry.js";
import { cacheGet, cacheSet, cacheKey } from "./cache-store.js";
import { toCanonical } from "../../shared/schema.js";
import { assertValidManga } from "../../infrastructure/validation/manga-validator.js";
import { healthCheckProviders } from "../../services/scrapers/ScraperRegistry.js";
import { validateChapterPages } from "../../shared/url-utils.js";
import { breakerStatus } from "../../core/circuit-breaker.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __handlerDir = path.dirname(fileURLToPath(import.meta.url));
const INGESTION_STATUS_PATH = path.join(__handlerDir, "..", "..", "..", "data", "ingestion-status.json");
function readIngestionStatus() {
    try {
        if (!fs.existsSync(INGESTION_STATUS_PATH))
            return null;
        return JSON.parse(fs.readFileSync(INGESTION_STATUS_PATH, "utf8"));
    }
    catch {
        return null;
    }
}
function cors(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        ...extra
    };
}
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: cors({ "Content-Type": "application/json" })
    });
}
function clientHeadersFromReq(req) {
    const h = {};
    const ua = req.headers.get("user-agent");
    if (ua)
        h["User-Agent"] = ua;
    const lang = req.headers.get("accept-language");
    if (lang)
        h["Accept-Language"] = lang;
    return h;
}
export async function handleProxyRequest(req) {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
    }
    if (req.method !== "GET") {
        return json({ error: "Method not allowed" }, 405);
    }
    const url = new URL(req.url);
    const path = url.pathname
        .replace(/^\/\.netlify\/functions\/manga-proxy/, "")
        .replace(/^\/api\/v1\/proxy/, "");
    try {
        if (path === "/health" || path === "/health/") {
            const providers = await healthCheckProviders();
            const ingestion = readIngestionStatus();
            const providersOk = Object.values(providers).some(Boolean);
            const ingestionOk = ingestion?.ok !== false;
            return json({
                ok: providersOk && ingestionOk,
                providers,
                breakers: breakerStatus(),
                ingestion,
                ts: new Date().toISOString()
            });
        }
        if (path === "/ingestion" || path === "/ingestion/") {
            const ingestion = readIngestionStatus();
            return json(ingestion || {
                ok: true,
                message: "Nenhuma ingestão registrada ainda.",
                ts: new Date().toISOString()
            });
        }
        const mangaMatch = path.match(/^\/manga\/([^/]+)$/);
        if (mangaMatch) {
            const mangaId = decodeURIComponent(mangaMatch[1]);
            const source = url.searchParams.get("source") || "auto";
            const key = cacheKey(source === "auto" ? "auto" : source, "manga", mangaId);
            const cached = await cacheGet(key);
            if (cached) {
                return json({
                    manga: cached.payload,
                    legacy: null,
                    cached: true,
                    cacheFrom: cached.from,
                    source: cached.source
                });
            }
            const { manga, source: resolved } = await fetchMangaAuto(mangaId, source);
            const canonical = toCanonical(manga, resolved);
            assertValidManga(canonical, mangaId);
            await cacheSet(key, canonical, resolved);
            return json({ manga: canonical, legacy: manga, cached: false, source: resolved });
        }
        const capMatch = path.match(/^\/manga\/([^/]+)\/chapter\/([^/]+)$/);
        if (capMatch) {
            const mangaId = decodeURIComponent(capMatch[1]);
            const chapterId = decodeURIComponent(capMatch[2]);
            const numeroCap = url.searchParams.get("n") || chapterId.replace(/\D/g, "") || "1";
            const source = url.searchParams.get("source") || "auto";
            const key = cacheKey(source === "auto" ? "auto" : source, "chapter", mangaId, `${chapterId}:${numeroCap}`);
            const cached = await cacheGet(key);
            if (cached) {
                return json({
                    manga: mangaId,
                    capitulo: chapterId,
                    pages: cached.payload,
                    cached: true,
                    cacheFrom: cached.from,
                    source: cached.source
                });
            }
            const { pages, source: resolved } = await fetchChapterAuto(mangaId, chapterId, numeroCap, source, clientHeadersFromReq(req));
            if (!validateChapterPages(pages)) {
                return json({ error: "Capítulo retornou páginas inválidas.", cached: false }, 502);
            }
            await cacheSet(key, pages, resolved);
            return json({
                manga: mangaId,
                capitulo: chapterId,
                pages,
                cached: false,
                source: resolved
            });
        }
        return json({ error: "Rota inválida." }, 404);
    }
    catch (error) {
        console.error("[MangaProxy] Erro:", error);
        return json({
            error: error.message || "Erro interno no proxy.",
            cached: false
        }, 502);
    }
}
/** Netlify Function default export */
export default handleProxyRequest;
export const config = { path: "/api/v1/proxy/*" };
export { toCanonical };
