/**
 * Proxy legacy (MJS) — fallback quando dist/ TypeScript não está compilado.
 */
import { fetchMangaAuto, fetchChapterAuto } from "./adapters/registry.mjs";
import { cacheGet, cacheSet, cacheKey } from "./lib/cache-store.mjs";

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
    if (ua) h["User-Agent"] = ua;
    const lang = req.headers.get("accept-language");
    if (lang) h["Accept-Language"] = lang;
    return h;
}

export default async (req) => {
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
        const mangaMatch = path.match(/^\/manga\/([^/]+)$/);
        if (mangaMatch) {
            const mangaId = decodeURIComponent(mangaMatch[1]);
            const source = url.searchParams.get("source") || "auto";
            const key = cacheKey(source === "auto" ? "auto" : source, "manga", mangaId);

            const cached = await cacheGet(key);
            if (cached) {
                return json({
                    manga: cached.payload,
                    cached: true,
                    cacheFrom: cached.from,
                    source: cached.source
                });
            }

            const { manga, source: resolved } = await fetchMangaAuto(mangaId, source);
            await cacheSet(key, manga, resolved);

            return json({ manga, cached: false, source: resolved });
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

            const { pages, source: resolved } = await fetchChapterAuto(
                mangaId, chapterId, numeroCap, source, clientHeadersFromReq(req)
            );
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
    } catch (error) {
        console.error("[MangaProxy] Erro:", error);
        return json({
            error: error.message || "Erro interno no proxy.",
            cached: false
        }, 502);
    }
};
