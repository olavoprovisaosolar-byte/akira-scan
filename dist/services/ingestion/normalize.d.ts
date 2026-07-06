import type { MangaLegacy } from "../../shared/schema.js";
import { type MangaCanonical } from "../../shared/schema.js";
export interface IngestManga {
    id: string;
    title: string;
    description: string;
    coverUrl: string;
    bannerUrl: string;
    genres: string[];
    status: string;
    author: string;
    chapters: Array<{
        id: string;
        number: number;
        title: string | null;
        url: string;
    }>;
    source: string;
}
/** Normaliza legacy ou canônico para estrutura de ingestão. */
export declare function normalizeIngestManga(raw: unknown, expectedId?: string, sourceHint?: string): IngestManga;
export declare function ingestToLegacy(n: IngestManga): MangaLegacy;
export declare function ingestToCanonical(n: IngestManga): MangaCanonical;
/** Sinopse real (não fallback genérico). */
export declare function hasRealSynopsis(n: IngestManga): boolean;
/** Capa real (não vazia nem placeholder). */
export declare function hasRealCover(n: IngestManga): boolean;
