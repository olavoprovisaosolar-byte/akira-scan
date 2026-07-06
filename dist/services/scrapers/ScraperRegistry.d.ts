/**
 * ScraperRegistry — failover A→B→C→D→E com validação de capítulos.
 */
import { MangaLivreScraper } from "./MangaLivreAdapter.js";
import { ToonLivreScraper } from "./ToonLivreAdapter.js";
import { MangaLivreToScraper } from "./MangaLivreToAdapter.js";
import { MangaLivreBlogScraper } from "./MangaLivreBlogAdapter.js";
import { BladeToonsScraper } from "./BladeToonsAdapter.js";
import type { MangaLegacy } from "../../shared/schema.js";
import type { PageRef } from "../../shared/schema.js";
export declare const PROVIDER_ORDER: readonly ["toonlivre", "mangalivre", "mangalivreto", "mangalivreblog", "bladetoons"];
export type ProviderName = typeof PROVIDER_ORDER[number];
declare const scrapers: {
    toonlivre: ToonLivreScraper;
    mangalivre: MangaLivreScraper;
    mangalivreto: MangaLivreToScraper;
    mangalivreblog: MangaLivreBlogScraper;
    bladetoons: BladeToonsScraper;
};
export interface FailoverAttempt {
    provider: string;
    ok: boolean;
    error?: string;
    empty?: boolean;
}
export interface FailoverResult {
    manga: MangaLegacy;
    source: string;
    attempts: FailoverAttempt[];
}
export declare function fetchMangaWithFailover(mangaId: string, preferred?: string): Promise<FailoverResult>;
export declare function fetchMangaAuto(mangaId: string, preferred?: string): Promise<{
    manga: MangaLegacy;
    source: string;
}>;
export declare function fetchChapterAuto(mangaId: string, chapterId: string, numeroCap: string, preferred?: string, clientHeaders?: Record<string, string>): Promise<{
    pages: PageRef[];
    source: string;
}>;
export declare function healthCheckProviders(): Promise<Record<string, boolean>>;
export { scrapers };
