/**
 * MangaStore — Map indexado por manga ID (evita mistura de capas/dados).
 */
import { validateMangaPayload } from "../services/data-validator.js";

class MangaStore {
    constructor() {
        /** @type {Map<string, object>} */
        this._mangas = new Map();
        this._loading = new Set();
    }

    get(id) {
        return this._mangas.get(id) || null;
    }

    has(id) {
        return this._mangas.has(id);
    }

    set(manga) {
        if (!manga?.id) return false;
        const check = validateMangaPayload(manga);
        if (!check.ok) {
            console.warn("[MangaStore] Payload rejeitado:", manga.id, check.error);
            return false;
        }
        this._mangas.set(manga.id, { ...manga, _storedAt: Date.now() });
        return true;
    }

    delete(id) {
        this._mangas.delete(id);
    }

    clear() {
        this._mangas.clear();
        this._loading.clear();
    }

    markLoading(id) {
        this._loading.add(id);
    }

    unmarkLoading(id) {
        this._loading.delete(id);
    }

    isLoading(id) {
        return this._loading.has(id);
    }

    list() {
        return [...this._mangas.values()];
    }

    size() {
        return this._mangas.size;
    }
}

export const mangaStore = new MangaStore();
