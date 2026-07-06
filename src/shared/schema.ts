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

export function toCanonical(manga: MangaLegacy, source = "unknown"): MangaCanonical {
    const baseUrl = manga.origem === "toonlivre"
        ? "https://toonlivre.net"
        : manga.origem === "mangalivreto"
            ? "https://mangalivre.to"
            : manga.origem === "mangalivreblog"
                ? "https://mangalivre.blog"
                : manga.origem === "bladetoons"
                    ? "https://bladetoons.com"
                    : "https://mangalivre.net";

    return {
        id: manga.id,
        title: manga.titulo || manga.id,
        coverUrl: manga.capa || "",
        synopsis: manga.sinopse || "",
        source: manga.origem || source,
        status: manga.status,
        genres: manga.generos || [],
        chapters: (manga.capitulos || []).map((c) => {
            const num = c.numero ?? (Number(String(c.id).replace(/\D/g, "")) || 0);
            return {
                id: c.id,
                url: `${baseUrl}/${encodeURIComponent(manga.id)}/${num}`,
                pages: [],
                number: num,
                title: c.titulo ?? null
            };
        })
    };
}

export function fromCanonical(c: MangaCanonical): MangaLegacy {
    return {
        id: c.id,
        titulo: c.title,
        sinopse: c.synopsis || "",
        capa: c.coverUrl,
        banner: c.coverUrl,
        autor: "",
        artista: "",
        generos: c.genres || [],
        status: c.status || "Em lançamento",
        popularidade: 50,
        capitulos: c.chapters.map((ch) => ({
            id: ch.id,
            numero: ch.number ?? (Number(String(ch.id).replace(/\D/g, "")) || 0),
            titulo: ch.title ?? null,
            paginas: ch.pages.length || 0,
            publicadoEm: new Date().toISOString()
        })),
        atualizadoEm: new Date().toISOString(),
        origem: (c.source as MangaLegacy["origem"]) || "api"
    };
}

export function attachChapterPages(
    manga: MangaCanonical,
    chapterId: string,
    pages: PageRef[]
): MangaCanonical {
    return {
        ...manga,
        chapters: manga.chapters.map((ch) =>
            ch.id === chapterId ? { ...ch, pages } : ch
        )
    };
}

export function assertCanonical(data: unknown): asserts data is MangaCanonical {
    if (!data || typeof data !== "object") throw new Error("Schema inválido.");
    const m = data as Record<string, unknown>;
    if (typeof m.id !== "string" || !m.id) throw new Error("id ausente.");
    if (typeof m.title !== "string") throw new Error("title ausente.");
    if (typeof m.coverUrl !== "string") throw new Error("coverUrl ausente.");
    if (!Array.isArray(m.chapters)) throw new Error("chapters deve ser array.");
}
