/**
 * MangaRepository — padrão Repository.
 * O frontend não sabe se os dados vêm de proxy, API, Firestore ou IndexedDB.
 */
import { MangaService } from "./manga-service.js";
import { OfflineStore } from "../core/offline-store.js";
import { assertManga } from "./validate.js";

export const MangaRepository = {
    async getById(mangaId, opts = {}) {
        const manga = await MangaService.getMangaDetails(mangaId, opts);
        if (manga) assertManga(manga, mangaId);
        return manga;
    },

    async getChapterPages(mangaId, numeroCap, chapterId, opts = {}) {
        return MangaService.getCapituloPaginas(mangaId, numeroCap, chapterId, opts);
    },

    async getOfflineManga(mangaId) {
        return OfflineStore.getManga(mangaId);
    },

    async getOfflineChapter(mangaId, chapterId) {
        return OfflineStore.getCapitulo(mangaId, chapterId);
    },

    async saveOffline(manga) {
        return MangaService.saveForOffline(manga);
    },

    reset() {
        MangaService.reset();
    }
};
