/**
 * Contrato de dados AkiraScan — fonte única de verdade para todas as camadas.
 */

export interface Capitulo {
    id: string;
    numero: number;
    titulo?: string | null;
    paginas?: number;
    publicadoEm?: string;
    novo?: boolean;
}

export interface Manga {
    id: string;
    titulo: string;
    sinopse: string;
    autor: string;
    artista: string;
    generos: string[];
    status: string;
    capa: string;
    banner: string;
    popularidade: number;
    capitulos: Capitulo[];
    atualizadoEm: string;
    origem: "toonlivre" | "firestore" | "biblioteca" | "destaque" | "api";
    toonlivreId?: string;
}

export interface CatalogoPayload {
    fonte: string;
    atualizadoEm: string;
    total: number;
    toonlivre?: number;
    mangas: Manga[];
}

export interface MangaResponse {
    manga: Manga;
}

export interface BibliotecaResponse {
    mangas: Manga[];
}

export interface PaginasResponse {
    manga: string;
    capitulo: string;
    pages: Array<{ index: number; url: string }>;
    demo?: boolean;
}

/** Schema canônico do proxy — { id, title, coverUrl, chapters: [{ id, url, pages }] } */
export interface ChapterCanonical {
    id: string;
    url: string;
    pages: Array<{ index: number; url: string }>;
    number?: number;
    title?: string | null;
}

export interface MangaCanonical {
    id: string;
    title: string;
    coverUrl: string;
    chapters: ChapterCanonical[];
    synopsis?: string;
    source?: string;
}

export interface ApiError {
    error: string;
}

/** Validação severa — usada em API (TS) e replicada no frontend. */
export function assertManga(data: unknown, expectedId?: string): asserts data is Manga {
    if (!data || typeof data !== "object") {
        throw new Error("Estrutura de dados corrompida.");
    }
    const m = data as Record<string, unknown>;
    if (typeof m.id !== "string" || !m.id) {
        throw new Error("ID do mangá ausente.");
    }
    if (expectedId && m.id !== expectedId) {
        throw new Error("ID do mangá inconsistente.");
    }
    if (typeof m.titulo !== "string" || !m.titulo) {
        throw new Error("Título do mangá ausente.");
    }
    if (!Array.isArray(m.capitulos)) {
        throw new Error("Estrutura de capítulos corrompida.");
    }
}

export function isManga(data: unknown): data is Manga {
    try {
        assertManga(data);
        return true;
    } catch {
        return false;
    }
}
