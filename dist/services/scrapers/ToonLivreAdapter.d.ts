import type { MangaLegacy } from "../../shared/schema.js";
export declare class ToonLivreScraper {
    readonly name = "toonlivre";
    fetchManga(mangaId: string): Promise<MangaLegacy>;
    fetchChapterPages(mangaId: string, chapterId: string, numeroCap: string, clientHeaders?: Record<string, string>): Promise<string[]>;
    private fetchMangaApi;
    private scrapeMangaHtml;
    /** Health ping — API search sem seguir redirect externo. */
    ping(): Promise<boolean>;
    normalizePages(urls: string[], apiPrefix?: string): {
        index: number;
        url: string;
    }[];
}
