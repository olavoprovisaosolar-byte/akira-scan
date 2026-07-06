/**
 * ToonLivre Adapter — API oficial + sessão HTML (via catalogo.mjs).
 */
import { BaseAdapter } from "./base-adapter.js";
import { withRetry } from "../retry.js";
export class ToonLivreAdapter extends BaseAdapter {
    name = "toonlivre";
    async fetchManga(mangaId) {
        return withRetry(async () => {
            // @ts-ignore — import dinâmico MJS legado
            const mod = await import("../../../../netlify/functions/toonlivre-client.mjs");
            const { obterMangaPorSlug, normalizarMangaRemoto } = mod;
            const raw = await obterMangaPorSlug(mangaId);
            return normalizarMangaRemoto(raw, "/api/catalogo");
        }, { label: `toonlivre:manga:${mangaId}` });
    }
    async fetchChapterPages(mangaId, chapterId, numeroCap, clientHeaders = {}) {
        return withRetry(async () => {
            // @ts-ignore — import dinâmico MJS legado
            const mod = await import("../../../../netlify/functions/catalogo.mjs");
            const { obterPaginasCapituloServidor } = mod;
            const pages = await obterPaginasCapituloServidor(mangaId, chapterId, numeroCap, clientHeaders);
            if (pages?.length)
                return pages;
            throw new Error("Capítulo ToonLivre sem páginas.");
        }, { label: `toonlivre:cap:${mangaId}:${chapterId}` });
    }
}
