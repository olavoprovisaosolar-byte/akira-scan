/** Classe base para adapters de provedores externos. */
export class BaseAdapter {
    /** @type {string} */
    name = "base";

    /** @returns {Promise<object|null>} */
    async fetchManga(_mangaId) {
        throw new Error("fetchManga não implementado.");
    }

    /** @returns {Promise<string[]>} URLs das páginas */
    async fetchChapterPages(_mangaId, _chapterId, _numeroCap) {
        throw new Error("fetchChapterPages não implementado.");
    }

    normalizePages(urls, apiPrefix = "/api/catalogo") {
        return urls.map((url, index) => ({
            index,
            url: url.startsWith("/") ? url : `${apiPrefix}/img?url=${encodeURIComponent(url)}`
        }));
    }
}
