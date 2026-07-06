/**
 * extractAllChapters — deep crawl com paginação e validação.
 */
import * as cheerio from "cheerio";
import { logger } from "../../core/logger.js";
import { fetchText } from "../../infrastructure/http/secure-client.js";
import { fetchHtmlWithBrowser, fetchHtmlWithScroll, usePlaywright } from "../../infrastructure/browser/playwright-scraper.js";
import {
    parseChapterNumber,
    validateChapterList,
    batchChapters,
    type ChapterRef
} from "../../shared/chapter-utils.js";

export interface ExtractChaptersOptions {
    baseUrl: string;
    mangaPath: string;
    mangaSlug: string;
    chapterLinkSelector: string;
    nextPageSelector?: string;
    maxPages?: number;
    throttleMs?: number;
    referer?: string;
    useScroll?: boolean;
}

function parseLink(
    href: string,
    text: string,
    slug: string,
    baseUrl: string
): ChapterRef | null {
    if (!href || !href.includes(slug)) return null;

    const numMatch = href.match(/capitulo-(\d+(?:\.\d+)?)/i)
        || href.match(/chapter-(\d+(?:\.\d+)?)/i)
        || href.match(/\/(\d+(?:\.\d+)?)\/?$/);

    const title = text.trim() || null;
    const number = numMatch
        ? Number(numMatch[1])
        : parseChapterNumber({ titulo: title, url: href });

    if (!number || number <= 0) return null;

    const id = `cap-${number}`;
    let url = href;
    if (!url.startsWith("http")) url = `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;

    return { id, number, title: title || `Capítulo ${number}`, url };
}

function extractFromHtml(
    html: string,
    opts: ExtractChaptersOptions
): ChapterRef[] {
    const $ = cheerio.load(html);
    return extractChaptersFromCheerio($, opts);
}

/** Extrai capítulos de DOM já carregado (sem paginação). */
export function extractChaptersFromCheerio(
    $: cheerio.CheerioAPI,
    opts: Pick<ExtractChaptersOptions, "chapterLinkSelector" | "mangaSlug" | "baseUrl">
): ChapterRef[] {
    const found: ChapterRef[] = [];
    const seen = new Set<string>();

    $(opts.chapterLinkSelector).each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        const ch = parseLink(href, text, opts.mangaSlug, opts.baseUrl);
        if (!ch || seen.has(ch.id)) return;
        seen.add(ch.id);
        found.push(ch);
    });

    return found.sort((a, b) => b.number - a.number);
}

function findNextPageUrl(html: string, baseUrl: string, selector: string): string | null {
    const $ = cheerio.load(html);
    const next = $(selector).first().attr("href");
    if (!next) return null;
    if (next.startsWith("http")) return next;
    return `${baseUrl}${next.startsWith("/") ? "" : "/"}${next}`;
}

async function loadPage(url: string, opts: ExtractChaptersOptions): Promise<string> {
    try {
        return await fetchText(url, { referer: opts.referer || opts.baseUrl });
    } catch {
        if (usePlaywright() || opts.useScroll) {
            return opts.useScroll
                ? fetchHtmlWithScroll(url, { waitMs: 2000, scrollSteps: 8 })
                : fetchHtmlWithBrowser(url);
        }
        throw new Error(`Falha ao carregar ${url}`);
    }
}

/**
 * Deep crawl — percorre paginação até esgotar capítulos.
 */
export async function extractAllChapters(opts: ExtractChaptersOptions): Promise<ChapterRef[]> {
    const maxPages = opts.maxPages ?? 30;
    const throttleMs = opts.throttleMs ?? 350;
    const seen = new Map<string, ChapterRef>();

    let url = opts.mangaPath.startsWith("http")
        ? opts.mangaPath
        : `${opts.baseUrl}${opts.mangaPath}`;

    for (let page = 0; page < maxPages; page++) {
        logger.debug("extractAllChapters", `Página ${page + 1}`, { url, slug: opts.mangaSlug });

        const html = await loadPage(url, opts);
        const batch = extractFromHtml(html, opts);

        for (const ch of batch) {
            if (!seen.has(ch.id)) seen.set(ch.id, ch);
        }

        if (!opts.nextPageSelector) break;

        const nextUrl = findNextPageUrl(html, opts.baseUrl, opts.nextPageSelector);
        if (!nextUrl || nextUrl === url) break;
        url = nextUrl;

        await new Promise((r) => setTimeout(r, throttleMs));
    }

    const chapters = [...seen.values()].sort((a, b) => b.number - a.number);
    const validation = validateChapterList(chapters);

    if (!validation.ok) {
        logger.scraperError("extractAllChapters", validation.error || "invalid", {
            slug: opts.mangaSlug,
            count: chapters.length
        });
        throw new Error(validation.error || "Lista de capítulos inválida.");
    }

    logger.info("extractAllChapters", `${chapters.length} capítulos extraídos`, {
        slug: opts.mangaSlug,
        batches: batchChapters(chapters, 50).length
    });

    return chapters;
}

/** Converte ChapterRef → formato legacy capitulos. */
export function chaptersToLegacy(chapters: ChapterRef[]) {
    return chapters.map((c) => ({
        id: c.id,
        numero: c.number,
        titulo: c.title,
        paginas: 0
    }));
}
