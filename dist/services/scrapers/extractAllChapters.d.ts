/**
 * extractAllChapters — deep crawl com paginação e validação.
 */
import * as cheerio from "cheerio";
import { type ChapterRef } from "../../shared/chapter-utils.js";
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
/** Extrai capítulos de DOM já carregado (sem paginação). */
export declare function extractChaptersFromCheerio($: cheerio.CheerioAPI, opts: Pick<ExtractChaptersOptions, "chapterLinkSelector" | "mangaSlug" | "baseUrl">): ChapterRef[];
/**
 * Deep crawl — percorre paginação até esgotar capítulos.
 */
export declare function extractAllChapters(opts: ExtractChaptersOptions): Promise<ChapterRef[]>;
/** Converte ChapterRef → formato legacy capitulos. */
export declare function chaptersToLegacy(chapters: ChapterRef[]): {
    id: string;
    numero: number;
    titulo: string | null;
    paginas: number;
}[];
