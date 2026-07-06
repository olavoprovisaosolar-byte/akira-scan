import type { MangaLegacy } from "../../../shared/schema.js";
import type { PageRef } from "../../../shared/schema.js";

export abstract class BaseAdapter {
    abstract readonly name: string;

    abstract fetchManga(mangaId: string): Promise<MangaLegacy>;

    abstract fetchChapterPages(
        mangaId: string,
        chapterId: string,
        numeroCap: string,
        clientHeaders?: Record<string, string>
    ): Promise<string[]>;

    normalizePages(urls: string[], apiPrefix = "/api/catalogo"): PageRef[] {
        return urls.map((url, index) => ({
            index,
            url: url.startsWith("/") ? url : `${apiPrefix}/img?url=${encodeURIComponent(url)}`
        }));
    }
}
