import { BaseAdapter } from "./base-adapter.js";
import type { MangaLegacy } from "../../../shared/schema.js";
export declare class MangaLivreAdapter extends BaseAdapter {
    readonly name = "mangalivre";
    fetchManga(mangaId: string): Promise<MangaLegacy>;
    fetchChapterPages(mangaId: string, _chapterId: string, numeroCap: string): Promise<string[]>;
    private loadHtml;
    private scrapeManga;
    private scrapeChapter;
}
