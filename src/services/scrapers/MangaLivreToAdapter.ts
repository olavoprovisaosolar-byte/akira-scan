/**
 * MangaLivreTo Scraper — contingência para https://mangalivre.to/
 * Invocado automaticamente quando mangalivre.net e toonlivre.net falham.
 */
import * as cheerio from "cheerio";
import { logger } from "../../core/logger.js";
import { getBreaker } from "../../core/circuit-breaker.js";
import { fetchText } from "../../infrastructure/http/secure-client.js";
import { fetchHtmlWithBrowser, usePlaywright } from "../../infrastructure/browser/playwright-scraper.js";
import { withRetry } from "../../server/proxy/retry.js";
import { MANGALIVRETO_SELECTORS } from "./selectors.js";
import { extractAllChapters, chaptersToLegacy, extractChaptersFromCheerio } from "./extractAllChapters.js";
import type { MangaLegacy } from "../../shared/schema.js";
import { resolveAbsoluteUrl, isValidChapterImageUrl } from "../../shared/url-utils.js";

const BASE = process.env.MANGALIVRETO_BASE_URL || "https://mangalivre.to";

export class MangaLivreToScraper {
    readonly name = "mangalivreto";

    async fetchManga(mangaId: string): Promise<MangaLegacy> {
        logger.info("MangaLivreToAdapter", "CONTINGÊNCIA — invocando mangalivre.to", { mangaId });
        return getBreaker(this.name).exec(() =>
            withRetry(() => this.scrapeManga(mangaId), { label: `mangalivreto:manga:${mangaId}` })
        );
    }

    async fetchChapterPages(
        mangaId: string,
        _chapterId: string,
        numeroCap: string,
        _clientHeaders: Record<string, string> = {}
    ): Promise<string[]> {
        logger.info("MangaLivreToAdapter", "CONTINGÊNCIA — capítulo via mangalivre.to", {
            mangaId,
            numeroCap
        });
        return getBreaker(this.name).exec(() =>
            withRetry(() => this.scrapeChapter(mangaId, numeroCap), {
                label: `mangalivreto:cap:${mangaId}:${numeroCap}`
            })
        );
    }

    /** Lista slugs da página de catálogo (ingestão inicial). */
    async listCatalogSlugs(maxPages = 3): Promise<string[]> {
        const slugs = new Set<string>();
        const paths = ["/manga/", "/manga/?m_orderby=views", "/manga/?m_orderby=latest"];

        for (let i = 0; i < Math.min(maxPages, paths.length); i++) {
            const html = await this.loadHtml(paths[i]);
            const $ = cheerio.load(html);
            $(MANGALIVRETO_SELECTORS.listingLinks).each((_, el) => {
                const href = $(el).attr("href") || "";
                const match = href.match(/\/manga\/([^/?#]+)\/?$/i);
                if (match?.[1] && match[1] !== "manga") slugs.add(match[1]);
            });
        }

        logger.info("MangaLivreToAdapter", `Listagem: ${slugs.size} slugs`, { maxPages });
        return [...slugs];
    }

    private async loadHtml(urlPath: string): Promise<string> {
        const url = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
        try {
            return await fetchText(url, { referer: `${BASE}/` });
        } catch (axiosErr) {
            if (usePlaywright()) {
                logger.info("MangaLivreToAdapter", "Fallback Playwright", { url });
                return fetchHtmlWithBrowser(url);
            }
            throw axiosErr;
        }
    }

    private slugPath(mangaId: string): string {
        const slug = mangaId.replace(/^mangalivreto:/, "");
        return `/manga/${encodeURIComponent(slug)}/`;
    }

    private async scrapeManga(mangaId: string): Promise<MangaLegacy> {
        const html = await this.loadHtml(this.slugPath(mangaId));
        const $ = cheerio.load(html);

        const ogTitle = $("meta[property='og:title']").attr("content")?.trim() || "";
        const titulo = $("h1, .post-title h1, .manga-title").first().text().trim()
            || ogTitle.replace(/\s*\|\s*Manga Livre.*/i, "")
            || mangaId;

        const sinopse = this.extractSynopsis($, ogTitle);
        let capa = $("meta[property='og:image']").attr("content")
            || $(".summary_image img, .thumb img, .manga-poster img").first().attr("src")
            || "";

        if (capa) capa = resolveAbsoluteUrl(BASE, capa);

        const slug = mangaId.replace(/^mangalivreto:/, "");
        let capitulos: MangaLegacy["capitulos"] = [];

        try {
            const chapters = await extractAllChapters({
                baseUrl: BASE,
                mangaPath: this.slugPath(mangaId),
                mangaSlug: slug,
                chapterLinkSelector: MANGALIVRETO_SELECTORS.chapterLinks,
                nextPageSelector: MANGALIVRETO_SELECTORS.nextPage,
                maxPages: 60,
                useScroll: true,
                referer: `${BASE}/`
            });
            capitulos = chaptersToLegacy(chapters);
        } catch (e) {
            logger.warn("MangaLivreToAdapter", "Deep crawl falhou, inline parse", {
                mangaId,
                err: (e as Error).message
            });
            capitulos = chaptersToLegacy(
                extractChaptersFromCheerio($, {
                    chapterLinkSelector: MANGALIVRETO_SELECTORS.chapterLinks,
                    mangaSlug: slug,
                    baseUrl: BASE
                })
            );
        }

        if (!capitulos.length) {
            logger.scraperError("MangaLivreTo", "Zero capítulos — layout alterado.", { mangaId });
        }

        const generos: string[] = [];
        $("a[rel='tag'], .genres-content a, .manga-genres a").each((_, el) => {
            const g = $(el).text().trim();
            if (g) generos.push(g);
        });

        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";

        logger.info("MangaLivreToAdapter", "Mangá obtido com sucesso", {
            mangaId,
            titulo,
            caps: capitulos.length
        });

        return {
            id: mangaId.replace(/^mangalivreto:/, ""),
            titulo,
            sinopse: sinopse || "",
            capa: capaProxy,
            banner: capaProxy,
            generos,
            status: "Em lançamento",
            capitulos,
            origem: "mangalivreto"
        };
    }

    private extractSynopsis($: cheerio.CheerioAPI, ogTitle: string): string {
        const metaDesc = $("meta[name='description']").attr("content")?.trim() || "";
        if (metaDesc && metaDesc.length > 40 && !metaDesc.includes("Manga Livre novo site")) {
            return metaDesc;
        }

        for (const sel of [".description", ".summary", ".sinopse", ".manga-excerpt", ".manga-summary", "#noidungm"]) {
            const text = $(sel).first().text().replace(/\s+/g, " ").trim();
            if (text.length > 60 && !/Your Rating|Avaliação|Average/i.test(text)) {
                return text.slice(0, 2000);
            }
        }

        const ogClean = ogTitle.replace(/\s*\|\s*Manga Livre.*/i, "").trim();
        return ogClean && ogClean !== "Todos os Mangás" ? ogClean : "";
    }

    private async scrapeChapter(mangaId: string, numeroCap: string): Promise<string[]> {
        const slug = mangaId.replace(/^mangalivreto:/, "");
        const paths = [
            `/manga/${encodeURIComponent(slug)}/capitulo-${numeroCap}/`,
            `/manga/${encodeURIComponent(slug)}/chapter-${numeroCap}/`
        ];

        let html = "";
        for (const p of paths) {
            try {
                html = await this.loadHtml(p);
                if (html.length > 500) break;
            } catch { /* próximo */ }
        }
        if (!html) throw new Error("Capítulo MangaLivreTo não encontrado.");

        let urls = this.extractPageUrls(html);
        if (urls.length < 2 && usePlaywright()) {
            logger.info("MangaLivreToAdapter", "Fallback Playwright capítulo", { mangaId, numeroCap });
            const scrollHtml = await fetchHtmlWithBrowser(
                `${BASE}/manga/${encodeURIComponent(slug)}/capitulo-${numeroCap}/`,
                4000
            );
            urls = this.extractPageUrls(scrollHtml);
        }

        if (!urls.length) {
            logger.scraperError("MangaLivreTo", "Nenhuma imagem no capítulo.", { mangaId, numeroCap });
            throw new Error("Layout MangaLivreTo alterado — nenhuma imagem no capítulo.");
        }

        logger.info("MangaLivreToAdapter", "Capítulo obtido", { mangaId, numeroCap, pages: urls.length });
        return urls;
    }

    private extractPageUrls(html: string): string[] {
        const $ = cheerio.load(html);
        const urls: string[] = [];
        const seen = new Set<string>();

        $(MANGALIVRETO_SELECTORS.pageImages).each((_, el) => {
            let src = ($(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "").trim();
            src = resolveAbsoluteUrl(BASE, src);
            if (!src || !isValidChapterImageUrl(src)) return;
            if (seen.has(src)) return;
            seen.add(src);
            urls.push(src);
        });
        return urls;
    }

    async ping(): Promise<boolean> {
        try {
            const html = await fetchText(`${BASE}/`, { referer: "" });
            return html.length > 1000;
        } catch {
            return false;
        }
    }

    normalizePages(urls: string[], apiPrefix = "/api/catalogo") {
        return urls.map((url, index) => ({
            index,
            url: url.startsWith("/") ? url : `${apiPrefix}/img?url=${encodeURIComponent(url)}`
        }));
    }
}
