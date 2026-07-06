/**
 * Schema canônico AkiraScan — contrato unificado entre proxy, API e frontend.
 * Formato: { id, title, coverUrl, chapters: [{ id, url, pages: [] }] }
 */
export interface PageRef {
    index: number;
    url: string;
}
export interface ChapterCanonical {
    id: string;
    url: string;
    pages: PageRef[];
    /** Número do capítulo (metadado interno) */
    number?: number;
    title?: string | null;
}
export interface MangaCanonical {
    id: string;
    title: string;
    coverUrl: string;
    chapters: ChapterCanonical[];
    /** Campos estendidos opcionais */
    synopsis?: string;
    source?: string;
    status?: string;
    genres?: string[];
}
/** Mangá interno (PT) — compatível com shared/types/manga.ts */
export interface MangaLegacy {
    id: string;
    titulo: string;
    sinopse?: string;
    capa: string;
    banner?: string;
    capitulos: Array<{
        id: string;
        numero?: number;
        titulo?: string | null;
        paginas?: number;
    }>;
    origem?: string;
    status?: string;
    generos?: string[];
    [key: string]: unknown;
}
export declare function toCanonical(manga: MangaLegacy, source?: string): MangaCanonical;
export declare function fromCanonical(c: MangaCanonical): MangaLegacy;
export declare function attachChapterPages(manga: MangaCanonical, chapterId: string, pages: PageRef[]): MangaCanonical;
export declare function assertCanonical(data: unknown): asserts data is MangaCanonical;
