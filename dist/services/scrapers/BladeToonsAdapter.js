/**
 * BladeToons Scraper — https://bladetoons.com/ (Next.js SPA)
 */
import * as cheerio from "cheerio";
import { logger } from "../../core/logger.js";
import { getBreaker } from "../../core/circuit-breaker.js";
import { fetchText } from "../../infrastructure/http/secure-client.js";
import { fetchHtmlWithScroll, usePlaywright } from "../../infrastructure/browser/playwright-scraper.js";
import { withRetry } from "../../server/proxy/retry.js";
import { BLADETOONS_SELECTORS } from "./selectors.js";
import { extractAllChapters, chaptersToLegacy, extractChaptersFromCheerio } from "./extractAllChapters.js";
import { validateChapterList } from "../../shared/chapter-utils.js";
const BASE = process.env.BLADETOONS_BASE_URL || "https://bladetoons.com";
export class BladeToonsScraper {
    name = "bladetoons";
    async fetchManga(mangaId) {
        logger.info("BladeToonsAdapter", "Invocando bladetoons.com", { mangaId });
        return getBreaker(this.name).exec(() => withRetry(() => this.scrapeManga(mangaId), { label: `bladetoons:manga:${mangaId}` }));
    }
    async fetchChapterPages(mangaId, _chapterId, numeroCap, _clientHeaders = {}) {
        return getBreaker(this.name).exec(() => withRetry(() => this.scrapeChapter(mangaId, numeroCap), {
            label: `bladetoons:cap:${mangaId}:${numeroCap}`
        }));
    }
    slugPath(slug) {
        const paths = [
            `/obra/${encodeURIComponent(slug)}`,
            `/manga/${encodeURIComponent(slug)}`,
            `/series/${encodeURIComponent(slug)}`,
            `/titulo/${encodeURIComponent(slug)}`
        ];
        return paths[0];
    }
    async loadHtml(pathOrUrl) {
        const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
        try {
            const html = await fetchText(url, { referer: `${BASE}/` });
            if (html.length > 5000)
                return html;
        }
        catch { /* fallback scroll */ }
        if (usePlaywright()) {
            return fetchHtmlWithScroll(url, { waitMs: 2500, scrollSteps: 12 });
        }
        throw new Error(`BladeToons requer SCRAPER_ENGINE=playwright para ${url}`);
    }
    parseNextData(html) {
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!m)
            return null;
        try {
            return JSON.parse(m[1]);
        }
        catch {
            return null;
        }
    }
    async scrapeManga(mangaId) {
        const slug = mangaId.replace(/^bladetoons:/, "");
        const candidatePaths = [
            `/obra/${encodeURIComponent(slug)}`,
            `/manga/${encodeURIComponent(slug)}`,
            `/series/${encodeURIComponent(slug)}`
        ];
        let html = "";
        let usedPath = candidatePaths[0];
        for (const p of candidatePaths) {
            try {
                html = await this.loadHtml(p);
                if (html.length > 3000 && !html.includes("404")) {
                    usedPath = p;
                    break;
                }
            }
            catch { /* next path */ }
        }
        if (!html)
            throw new Error(`BladeToons — mangá não encontrado: ${slug}`);
        const nextData = this.parseNextData(html);
        const pageProps = nextData?.props?.pageProps;
        const mangaData = pageProps?.manga;
        const $ = cheerio.load(html);
        const titulo = String(pageProps?.title || mangaData?.title || $("h1").first().text().trim()
            || $("meta[property='og:title']").attr("content")?.trim()
            || slug);
        let capa = String(pageProps?.cover || mangaData?.cover || "")
            || $("meta[property='og:image']").attr("content")
            || $("img[src*='cover'], img[alt*='capa']").first().attr("src")
            || "";
        if (capa && !capa.startsWith("http"))
            capa = `${BASE}${capa}`;
        const sinopse = String(pageProps?.description || mangaData?.description || "")
            || $("meta[name='description']").attr("content")?.trim()
            || "";
        let capitulos = [];
        const apiChapters = pageProps?.chapters || mangaData?.chapters;
        if (Array.isArray(apiChapters) && apiChapters.length) {
            capitulos = apiChapters.map((c, i) => {
                const num = Number(c.number ?? c.numero ?? i + 1);
                return {
                    id: String(c.id || `cap-${num}`),
                    numero: num,
                    titulo: c.title ? String(c.title) : null,
                    paginas: 0
                };
            });
        }
        else {
            try {
                const chapters = await extractAllChapters({
                    baseUrl: BASE,
                    mangaPath: usedPath,
                    mangaSlug: slug,
                    chapterLinkSelector: BLADETOONS_SELECTORS.chapterLinks,
                    nextPageSelector: BLADETOONS_SELECTORS.nextPage,
                    maxPages: 50,
                    useScroll: true,
                    referer: `${BASE}/`
                });
                capitulos = chaptersToLegacy(chapters);
            }
            catch {
                const inline = extractChaptersFromCheerio($, {
                    chapterLinkSelector: BLADETOONS_SELECTORS.chapterLinks,
                    mangaSlug: slug,
                    baseUrl: BASE
                });
                const v = validateChapterList(inline);
                if (!v.ok)
                    throw new Error(v.error || "Capítulos BladeToons inválidos.");
                capitulos = chaptersToLegacy(inline);
            }
        }
        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";
        logger.info("BladeToonsAdapter", "Mangá obtido", { mangaId: slug, caps: capitulos.length });
        return {
            id: slug,
            titulo,
            sinopse,
            capa: capaProxy,
            banner: capaProxy,
            generos: [],
            status: "Em lançamento",
            capitulos,
            origem: "bladetoons"
        };
    }
    async scrapeChapter(mangaId, numeroCap) {
        const slug = mangaId.replace(/^bladetoons:/, "");
        const paths = [
            `/obra/${encodeURIComponent(slug)}/capitulo-${numeroCap}`,
            `/obra/${encodeURIComponent(slug)}/chapter-${numeroCap}`,
            `/manga/${encodeURIComponent(slug)}/capitulo-${numeroCap}`
        ];
        let html = "";
        for (const p of paths) {
            try {
                html = await this.loadHtml(p);
                if (html.length > 500)
                    break;
            }
            catch { /* next */ }
        }
        if (!html)
            throw new Error("Capítulo BladeToons não encontrado.");
        const $ = cheerio.load(html);
        const urls = [];
        const seen = new Set();
        $(BLADETOONS_SELECTORS.pageImages).each((_, el) => {
            let src = ($(el).attr("src") || $(el).attr("data-src") || "").trim();
            if (!src || /logo|avatar|icon/i.test(src))
                return;
            if (!src.startsWith("http"))
                src = `${BASE}${src}`;
            if (seen.has(src))
                return;
            seen.add(src);
            urls.push(src);
        });
        if (!urls.length)
            throw new Error("BladeToons — nenhuma imagem no capítulo.");
        return urls;
    }
    async ping() {
        try {
            const html = await fetchText(`${BASE}/`, { referer: "" });
            return html.length > 1000;
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
