/**
 * DataNormalizer — garante estrutura uniforme independente da fonte.
 */
import { MANGA_FALLBACKS } from "../../shared/mangaSchema.js";

export interface NormalizedChapter {
    id: string;
    number: number;
    title: string | null;
    url: string;
}

export interface NormalizedManga {
    id: string;
    title: string;
    description: string;
    bannerUrl: string;
    coverUrl: string;
    genre: string[];
    status: string;
    author: string;
    chapters: NormalizedChapter[];
    source: string;
    /** Dados legacy PT para compatibilidade */
    _legacy: Record<string, unknown>;
}

function str(v: unknown, fallback: string): string {
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function num(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/** Normaliza payload de qualquer fonte (proxy canônico, legacy PT, API). */
export function normalizeManga(raw: unknown, expectedId?: string): NormalizedManga {
    if (!raw || typeof raw !== "object") {
        throw new Error("Dados do mangá inválidos.");
    }

    const m = raw as Record<string, unknown>;

    const id = str(m.id, expectedId || "");
    if (!id) throw new Error("ID do mangá ausente.");
    if (expectedId && id !== expectedId) {
        throw new Error(`ID inconsistente: esperado ${expectedId}, recebido ${id}.`);
    }

    const title = str(m.title ?? m.titulo, MANGA_FALLBACKS.title);
    const description = str(m.description ?? m.sinopse ?? m.synopsis, MANGA_FALLBACKS.description);
    const coverUrl = str(m.coverUrl ?? m.capa, MANGA_FALLBACKS.coverUrl);
    const bannerUrl = str(m.bannerUrl ?? m.banner ?? m.capa, coverUrl || MANGA_FALLBACKS.bannerUrl);
    const genre = Array.isArray(m.genre)
        ? (m.genre as string[])
        : Array.isArray(m.generos)
            ? (m.generos as string[])
            : Array.isArray(m.genres)
                ? (m.genres as string[])
                : [MANGA_FALLBACKS.genre];

    const rawChapters = (m.chapters ?? m.capitulos ?? []) as unknown[];
    const chapters: NormalizedChapter[] = rawChapters.map((ch) => {
        const c = ch as Record<string, unknown>;
        const chId = str(c.id, `cap-${num(c.number ?? c.numero)}`);
        let number = num(c.number ?? c.numero, 0);
        if (number <= 0) {
            const tail = String(chId).match(/-(\d+(?:\.\d+)?)$/);
            number = tail ? num(tail[1], 0) : 0;
        }
        return {
            id: chId,
            number,
            title: typeof c.title === "string" ? c.title : typeof c.titulo === "string" ? c.titulo : null,
            url: str(c.url, "")
        };
    }).filter((c) => c.id && c.number > 0);

    const source = str(m.source ?? m.origem, "unknown");

    const legacy = {
        id,
        titulo: title,
        sinopse: description,
        capa: coverUrl,
        banner: bannerUrl,
        generos: genre,
        status: str(m.status, MANGA_FALLBACKS.status),
        autor: str(m.author ?? m.autor, MANGA_FALLBACKS.author),
        artista: str(m.artista ?? m.artist, ""),
        capitulos: chapters.map((c) => ({
            id: c.id,
            numero: c.number,
            titulo: c.title,
            paginas: 0
        })),
        origem: source
    };

    return {
        id,
        title,
        description,
        bannerUrl,
        coverUrl,
        genre,
        status: legacy.status as string,
        author: legacy.autor as string,
        chapters,
        source,
        _legacy: legacy
    };
}

/** Mangá completo o suficiente para exibir em Populares/Destaques. */
export function isCompleteManga(m: NormalizedManga): boolean {
    return Boolean(
        m.id &&
        m.title &&
        m.title !== MANGA_FALLBACKS.title &&
        (m.bannerUrl || m.coverUrl) &&
        m.chapters.length > 0
    );
}

/** Converte de volta para formato legacy consumido pelas views atuais. */
export function toLegacyManga(n: NormalizedManga): Record<string, unknown> {
    return { ...n._legacy, id: n.id };
}
