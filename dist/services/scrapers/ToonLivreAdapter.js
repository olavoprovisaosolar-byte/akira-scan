/**
 * ToonLivre Scraper — API oficial + sessão HTML (sem redirect cross-domain).
 */
import { logger } from "../../core/logger.js";
import { getBreaker } from "../../core/circuit-breaker.js";
import { fetchText, browserHeaders } from "../../infrastructure/http/secure-client.js";
import { withRetry } from "../../server/proxy/retry.js";
import { TOONLIVRE_API } from "./selectors.js";
const BASE = process.env.TOONLIVRE_BASE_URL || "https://toonlivre.net";
export class ToonLivreScraper {
    name = "toonlivre";
    async fetchManga(mangaId) {
        return getBreaker(this.name).exec(() => withRetry(() => this.fetchMangaApi(mangaId), { label: `toonlivre:manga:${mangaId}` }));
    }
    async fetchChapterPages(mangaId, chapterId, numeroCap, clientHeaders = {}) {
        return getBreaker(this.name).exec(() => withRetry(async () => {
            // @ts-ignore MJS legado
            const mod = await import("../../../netlify/functions/catalogo.mjs");
            const pages = await mod.obterPaginasCapituloServidor(mangaId, chapterId, numeroCap, clientHeaders);
            if (pages?.length)
                return pages;
            throw new Error("Capítulo ToonLivre sem páginas.");
        }, { label: `toonlivre:cap:${mangaId}:${chapterId}` }));
    }
    async fetchMangaApi(mangaId) {
        try {
            // @ts-ignore MJS legado
            const mod = await import("../../../netlify/functions/toonlivre-client.mjs");
            const raw = await mod.obterMangaPorSlug(mangaId);
            return mod.normalizarMangaRemoto(raw, "/api/catalogo");
        }
        catch (apiErr) {
            logger.warn("ToonLivreScraper", `API falhou: ${apiErr.message}`, { mangaId });
            return this.scrapeMangaHtml(mangaId);
        }
    }
    async scrapeMangaHtml(mangaId) {
        const url = `${BASE}/${encodeURIComponent(mangaId)}`;
        const html = await fetchText(url, { referer: `${BASE}/` });
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        const coverMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        const titulo = titleMatch?.[1]?.trim() || mangaId;
        let capa = coverMatch?.[1] || "";
        if (capa && !capa.startsWith("http"))
            capa = `${BASE}${capa}`;
        const capitulos = [];
        const re = new RegExp(`${mangaId}/(\\d+)`, "g");
        const seen = new Set();
        let m;
        while ((m = re.exec(html)) !== null) {
            const numero = Number(m[1]);
            const id = `cap-${m[1]}`;
            if (seen.has(id))
                continue;
            seen.add(id);
            capitulos.push({ id, numero, titulo: null, paginas: 0 });
        }
        if (!capitulos.length) {
            logger.scraperError("ToonLivre", "HTML sem capítulos — layout alterado.", { mangaId });
        }
        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";
        return {
            id: mangaId,
            titulo,
            sinopse: "",
            capa: capaProxy,
            banner: capaProxy,
            generos: [],
            status: "Em lançamento",
            capitulos,
            origem: "toonlivre"
        };
    }
    /** Health ping — API search sem seguir redirect externo. */
    async ping() {
        try {
            const path = `${TOONLIVRE_API.search}?page=1&limit=1&sortBy=popular&sortOrder=desc`;
            await fetchText(`${BASE}${path}`, {
                headers: browserHeaders(BASE, { "x-tly-sec": process.env.TOONLIVRE_TOKEN_VALUE || "web-z99" })
            });
            return true;
        }
        catch {
            return false;
        }
    }
    normalizePages(urls, apiPrefix = "/api/catalogo") {
        return urls.map((url, index) => ({
            index,
            url: url.startsWith("/") ? url : `${apiPrefix}/img?url=${encodeURIComponent(url)}`
        }));
    }
}
