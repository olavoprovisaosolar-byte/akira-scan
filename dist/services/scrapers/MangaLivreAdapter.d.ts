import type { MangaLegacy } from "../../shared/schema.js";
export declare class MangaLivreScraper {
    readonly name = "mangalivre";
    fetchManga(mangaId: string): Promise<MangaLegacy>;
    fetchChapterPages(mangaId: string, _chapterId: string, numeroCap: string): Promise<string[]>;
    private loadHtml;
    private scrapeManga;
    private scrapeChapter;
    normalizePages(urls: string[], apiPrefix?: string): {
        index: number;
        url: string;
    }[];
}
