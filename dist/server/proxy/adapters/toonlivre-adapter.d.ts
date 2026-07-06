/**
 * ToonLivre Adapter — API oficial + sessão HTML (via catalogo.mjs).
 */
import { BaseAdapter } from "./base-adapter.js";
import type { MangaLegacy } from "../../../shared/schema.js";
export declare class ToonLivreAdapter extends BaseAdapter {
    readonly name = "toonlivre";
    fetchManga(mangaId: string): Promise<MangaLegacy>;
    fetchChapterPages(mangaId: string, chapterId: string, numeroCap: string, clientHeaders?: Record<string, string>): Promise<string[]>;
}
