import type { MangaLegacy } from "../../shared/schema.js";
export declare class MangaLivreToScraper {
    readonly name = "mangalivreto";
    fetchManga(mangaId: string): Promise<MangaLegacy>;
    fetchChapterPages(mangaId: string, _chapterId: string, numeroCap: string, _clientHeaders?: Record<string, string>): Promise<string[]>;
    /** Lista slugs da página de catálogo (ingestão inicial). */
    listCatalogSlugs(maxPages?: number): Promise<string[]>;
    private loadHtml;
    private slugPath;
    private scrapeManga;
    private extractSynopsis;
    private scrapeChapter;
    private extractPageUrls;
    ping(): Promise<boolean>;
    normalizePages(urls: string[], apiPrefix?: string): {
        index: number;
        url: string;
    }[];
}
