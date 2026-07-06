/**
 * MangaLivreBlog Scraper — https://mangalivre.blog/
 */
import * as cheerio from "cheerio";
import { logger } from "../../core/logger.js";
import { getBreaker } from "../../core/circuit-breaker.js";
import { fetchText, fetchJson } from "../../infrastructure/http/secure-client.js";
import { fetchHtmlWithBrowser, fetchHtmlWithScroll, usePlaywright } from "../../infrastructure/browser/playwright-scraper.js";
import { withRetry } from "../../server/proxy/retry.js";
import { MANGALIVREBLOG_SELECTORS } from "./selectors.js";
import { extractAllChapters, chaptersToLegacy, extractChaptersFromCheerio } from "./extractAllChapters.js";
import type { MangaLegacy } from "../../shared/schema.js";
import { resolveAbsoluteUrl, isValidChapterImageUrl } from "../../shared/url-utils.js";

const BASE = process.env.MANGALIVREBLOG_BASE_URL || "https://mangalivre.blog";

export class MangaLivreBlogScraper {
    readonly name = "mangalivreblog";

    async fetchManga(mangaId: string): Promise<MangaLegacy> {
        logger.info("MangaLivreBlogAdapter", "Invocando mangalivre.blog", { mangaId });
        return getBreaker(this.name).exec(() =>
            withRetry(() => this.scrapeManga(mangaId), { label: `mangalivreblog:manga:${mangaId}` })
        );
    }

    async fetchChapterPages(
        mangaId: string,
        _chapterId: string,
        numeroCap: string,
        _clientHeaders: Record<string, string> = {}
    ): Promise<string[]> {
        return getBreaker(this.name).exec(() =>
            withRetry(() => this.scrapeChapter(mangaId, numeroCap), {
                label: `mangalivreblog:cap:${mangaId}:${numeroCap}`
            })
        );
    }

    private slugPath(mangaId: string): string {
        return `/manga/${encodeURIComponent(mangaId.replace(/^mangalivreblog:/, ""))}/`;
    }

    private async loadHtml(urlPath: string, scroll = false): Promise<string> {
        const url = urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`;
        try {
            return await fetchText(url, { referer: `${BASE}/` });
        } catch {
            if (scroll || usePlaywright()) {
                return scroll
                    ? fetchHtmlWithScroll(url)
                    : fetchHtmlWithBrowser(url);
            }
            throw new Error(`MangaLivreBlog indisponível: ${url}`);
        }
    }

    private async scrapeManga(mangaId: string): Promise<MangaLegacy> {
        const slug = mangaId.replace(/^mangalivreblog:/, "");

        try {
            const api = await fetchJson<Record<string, unknown>>(
                `${BASE}/wp-json/slimeread/v1/manga/${encodeURIComponent(slug)}`,
                { referer: `${BASE}/` }
            );
            if (api && (api.title || api.name)) {
                return this.fromApi(slug, api);
            }
        } catch {
            logger.debug("MangaLivreBlogAdapter", "API indisponível, fallback HTML", { mangaId });
        }

        const html = await this.loadHtml(this.slugPath(slug), true);
        const $ = cheerio.load(html);

        const titulo = $("h1, .post-title h1").first().text().trim()
            || $("meta[property='og:title']").attr("content")?.replace(/\s*\|.*/i, "").trim()
            || slug;

        let capa = $("meta[property='og:image']").attr("content")
            || $(".summary_image img, .thumb img").first().attr("src") || "";
        if (capa) capa = resolveAbsoluteUrl(BASE, capa);

        const sinopse = $("meta[name='description']").attr("content")?.trim()
            || $(MANGALIVREBLOG_SELECTORS.synopsis).first().text().trim()
            || "";

        let capitulos: MangaLegacy["capitulos"] = [];
        try {
            const chapters = await extractAllChapters({
                baseUrl: BASE,
                mangaPath: this.slugPath(slug),
                mangaSlug: slug,
                chapterLinkSelector: MANGALIVREBLOG_SELECTORS.chapterLinks,
                nextPageSelector: MANGALIVREBLOG_SELECTORS.nextPage,
                maxPages: 40,
                useScroll: true,
                referer: `${BASE}/`
            });
            capitulos = chaptersToLegacy(chapters);
        } catch (e) {
            logger.warn("MangaLivreBlogAdapter", "Deep crawl falhou, parse inline", {
                mangaId,
                err: (e as Error).message
            });
            capitulos = chaptersToLegacy(
                extractChaptersFromCheerio($, {
                    chapterLinkSelector: MANGALIVREBLOG_SELECTORS.chapterLinks,
                    mangaSlug: slug,
                    baseUrl: BASE
                })
            );
        }

        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";
        return {
            id: slug,
            titulo,
            sinopse: sinopse || "",
            capa: capaProxy,
            banner: capaProxy,
            generos: [],
            status: "Em lançamento",
            capitulos,
            origem: "mangalivreblog"
        };
    }

    private fromApi(slug: string, api: Record<string, unknown>): MangaLegacy {
        const titulo = String(api.title || api.name || slug);
        let capa = String(api.cover || api.thumbnail || api.image || "");
        if (capa) capa = resolveAbsoluteUrl(BASE, capa);

        const rawCh = (api.chapters || api.capitulos || []) as Array<Record<string, unknown>>;
        const capitulos = rawCh.map((c, i) => {
            const num = Number(c.number ?? c.numero ?? i + 1);
            return {
                id: String(c.id || `cap-${num}`),
                numero: num,
                titulo: c.title ? String(c.title) : null,
                paginas: 0
            };
        });

        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";
        return {
            id: slug,
            titulo,
            sinopse: String(api.description || api.sinopse || ""),
            capa: capaProxy,
            banner: capaProxy,
            generos: Array.isArray(api.genres) ? (api.genres as string[]) : [],
            status: String(api.status || "Em lançamento"),
            capitulos,
            origem: "mangalivreblog"
        };
    }

    private async scrapeChapter(mangaId: string, numeroCap: string): Promise<string[]> {
        const slug = mangaId.replace(/^mangalivreblog:/, "");
        const paths = [
            `/manga/${encodeURIComponent(slug)}/capitulo-${numeroCap}/`,
            `/manga/${encodeURIComponent(slug)}/chapter-${numeroCap}/`
        ];

        let html = "";
        for (const p of paths) {
            try {
                html = await this.loadHtml(p);
                if (html.length > 500) break;
            } catch { /* next */ }
        }
        if (!html) throw new Error("Capítulo MangaLivreBlog não encontrado.");

        const $ = cheerio.load(html);
        const urls: string[] = [];
        const seen = new Set<string>();

        $(MANGALIVREBLOG_SELECTORS.pageImages).each((_, el) => {
            let src = ($(el).attr("src") || $(el).attr("data-src") || "").trim();
            src = resolveAbsoluteUrl(BASE, src);
            if (!src || !isValidChapterImageUrl(src)) return;
            if (seen.has(src)) return;
            seen.add(src);
            urls.push(src);
        });

        if (!urls.length) throw new Error("MangaLivreBlog — nenhuma imagem no capítulo.");
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
