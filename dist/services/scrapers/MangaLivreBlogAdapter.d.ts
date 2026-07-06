import type { MangaLegacy } from "../../shared/schema.js";
export declare class MangaLivreBlogScraper {
    readonly name = "mangalivreblog";
    fetchManga(mangaId: string): Promise<MangaLegacy>;
    fetchChapterPages(mangaId: string, _chapterId: string, numeroCap: string, _clientHeaders?: Record<string, string>): Promise<string[]>;
    private slugPath;
    private loadHtml;
    private scrapeManga;
    private fromApi;
    private scrapeChapter;
    ping(): Promise<boolean>;
    normalizePages(urls: string[], apiPrefix?: string): {
        index: number;
        url: string;
    }[];
}
