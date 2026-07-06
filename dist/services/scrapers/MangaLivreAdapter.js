/**
 * MangaLivre Scraper — seletores dedicados + Cheerio + Playwright opcional.
 */
import * as cheerio from "cheerio";
import { logger } from "../../core/logger.js";
import { getBreaker } from "../../core/circuit-breaker.js";
import { fetchText } from "../../infrastructure/http/secure-client.js";
import { fetchHtmlWithBrowser, usePlaywright } from "../../infrastructure/browser/playwright-scraper.js";
import { withRetry } from "../../server/proxy/retry.js";
import { MANGALIVRE_SELECTORS } from "./selectors.js";
import { extractAllChapters, chaptersToLegacy, extractChaptersFromCheerio } from "./extractAllChapters.js";
import { resolveAbsoluteUrl, isValidChapterImageUrl } from "../../shared/url-utils.js";
const BASE = process.env.MANGALIVRE_BASE_URL || "https://mangalivre.net";
export class MangaLivreScraper {
    name = "mangalivre";
    async fetchManga(mangaId) {
        return getBreaker(this.name).exec(() => withRetry(() => this.scrapeManga(mangaId), { label: `mangalivre:manga:${mangaId}` }));
    }
    async fetchChapterPages(mangaId, _chapterId, numeroCap) {
        return getBreaker(this.name).exec(() => withRetry(() => this.scrapeChapter(mangaId, numeroCap), {
            label: `mangalivre:cap:${mangaId}:${numeroCap}`
        }));
    }
    async loadHtml(urlPath) {
        const url = `${BASE}${urlPath}`;
        try {
            return await fetchText(url, { referer: BASE });
        }
        catch (axiosErr) {
            if (usePlaywright()) {
                logger.info("MangaLivreScraper", "Fallback Playwright", { url });
                return fetchHtmlWithBrowser(url);
            }
            throw axiosErr;
        }
    }
    async scrapeManga(mangaId) {
        const html = await this.loadHtml(`/manga/${encodeURIComponent(mangaId)}`);
        const $ = cheerio.load(html);
        const titulo = $("h1, .post-title h1, .manga-title").first().text().trim()
            || $("meta[property='og:title']").attr("content")?.trim()
            || mangaId;
        const sinopse = $(MANGALIVRE_SELECTORS.synopsis).first().text().trim();
        let capa = $("meta[property='og:image']").attr("content")
            || $(".summary_image img, .thumb img").first().attr("src") || "";
        if (capa)
            capa = resolveAbsoluteUrl(BASE, capa);
        let capitulos = [];
        try {
            const chapters = await extractAllChapters({
                baseUrl: BASE,
                mangaPath: `/manga/${encodeURIComponent(mangaId)}`,
                mangaSlug: mangaId,
                chapterLinkSelector: MANGALIVRE_SELECTORS.chapterLinks,
                nextPageSelector: ".pagination a.next, a.next.page-numbers",
                maxPages: 40,
                referer: BASE
            });
            capitulos = chaptersToLegacy(chapters);
        }
        catch {
            capitulos = chaptersToLegacy(extractChaptersFromCheerio($, {
                chapterLinkSelector: MANGALIVRE_SELECTORS.chapterLinks,
                mangaSlug: mangaId,
                baseUrl: BASE
            }));
        }
        if (!capitulos.length) {
            logger.scraperError("MangaLivre", "Site mudou a estrutura HTML — zero capítulos.", { mangaId });
        }
        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";
        return {
            id: mangaId,
            titulo,
            sinopse: sinopse || "Sem sinopse disponível.",
            capa: capaProxy,
            banner: capaProxy,
            generos: [],
            status: "Em lançamento",
            capitulos,
            origem: "mangalivre"
        };
    }
    async scrapeChapter(mangaId, numeroCap) {
        const paths = [
            `/manga/${encodeURIComponent(mangaId)}/capitulo-${numeroCap}`,
            `/manga/${encodeURIComponent(mangaId)}/chapter-${numeroCap}`,
            `/${encodeURIComponent(mangaId)}/${numeroCap}`
        ];
        let html = "";
        for (const p of paths) {
            try {
                html = await this.loadHtml(p);
                if (html.length > 500)
                    break;
            }
            catch { /* próximo */ }
        }
        if (!html)
            throw new Error("Capítulo MangaLivre não encontrado.");
        const $ = cheerio.load(html);
        const urls = [];
        const seen = new Set();
        $(".reading-content img, .page-chapter img, .chapter-content img, .images-chapter img").each((_, el) => {
            let src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "";
            src = resolveAbsoluteUrl(BASE, src.trim());
            if (!src || !isValidChapterImageUrl(src))
                return;
            if (seen.has(src))
                return;
            seen.add(src);
            urls.push(src);
        });
        if (!urls.length) {
            logger.scraperError("MangaLivre", "Layout alterado — nenhuma imagem no capítulo.", { mangaId, numeroCap });
            throw new Error("Layout MangaLivre alterado — nenhuma imagem no capítulo.");
        }
        return urls;
    }
    normalizePages(urls, apiPrefix = "/api/catalogo") {
        return urls.map((url, index) => ({
            index,
            url: url.startsWith("/") ? url : `${apiPrefix}/img?url=${encodeURIComponent(url)}`
        }));
    }
}
