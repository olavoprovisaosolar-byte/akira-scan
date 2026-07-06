/**
 * Normalização cross-source — estrutura única independente do provedor.
 */
import { MANGA_FALLBACKS } from "../../shared/mangaSchema.js";
import type { MangaLegacy } from "../../shared/schema.js";
import { toCanonical, type MangaCanonical } from "../../shared/schema.js";

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

function str(v: unknown, fallback: string): string {
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function num(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

const SOURCE_BASE: Record<string, string> = {
    toonlivre: "https://toonlivre.net",
    mangalivre: "https://mangalivre.net",
    mangalivreto: "https://mangalivre.to",
    mangalivreblog: "https://mangalivre.blog",
    bladetoons: "https://bladetoons.com"
};

/** Normaliza legacy ou canônico para estrutura de ingestão. */
export function normalizeIngestManga(raw: unknown, expectedId?: string, sourceHint = "unknown"): IngestManga {
    if (!raw || typeof raw !== "object") {
        throw new Error("Dados inválidos para normalização.");
    }

    const m = raw as Record<string, unknown>;
    const id = str(m.id, expectedId || "");
    if (!id) throw new Error("ID ausente.");

    const source = str(m.source ?? m.origem, sourceHint);
    const base = SOURCE_BASE[source] || "https://mangalivre.net";

    const title = str(m.title ?? m.titulo, MANGA_FALLBACKS.title);
    const description = str(m.description ?? m.sinopse ?? m.synopsis, MANGA_FALLBACKS.description);
    const coverUrl = str(m.coverUrl ?? m.capa, MANGA_FALLBACKS.coverUrl);
    const bannerUrl = str(m.bannerUrl ?? m.banner ?? m.capa, coverUrl || MANGA_FALLBACKS.bannerUrl);
    const genres = Array.isArray(m.genres)
        ? (m.genres as string[])
        : Array.isArray(m.generos)
            ? (m.generos as string[])
            : [];

    const rawChapters = (m.chapters ?? m.capitulos ?? []) as unknown[];
    const chapters = rawChapters.map((ch) => {
        const c = ch as Record<string, unknown>;
        const chId = str(c.id, `cap-${num(c.number ?? c.numero)}`);
        const number = num(c.number ?? c.numero ?? String(chId).replace(/\D/g, ""), 0);
        let chUrl = str(c.url, "");
        if (!chUrl) {
            if (source === "mangalivreto") {
                chUrl = `${base}/manga/${encodeURIComponent(id)}/capitulo-${number}/`;
            } else if (source === "mangalivre") {
                chUrl = `${base}/manga/${encodeURIComponent(id)}/capitulo-${number}`;
            } else {
                chUrl = `${base}/${encodeURIComponent(id)}/${number}`;
            }
        }
        return {
            id: chId,
            number,
            title: typeof c.title === "string" ? c.title : typeof c.titulo === "string" ? c.titulo : null,
            url: chUrl
        };
    }).filter((c) => c.id && c.number > 0);

    return {
        id,
        title,
        description,
        coverUrl,
        bannerUrl,
        genres,
        status: str(m.status, MANGA_FALLBACKS.status),
        author: str(m.author ?? m.autor, MANGA_FALLBACKS.author),
        chapters,
        source
    };
}

export function ingestToLegacy(n: IngestManga): MangaLegacy {
    const capaProxy = n.coverUrl.startsWith("/api/")
        ? n.coverUrl
        : n.coverUrl
            ? `/api/catalogo/img?url=${encodeURIComponent(n.coverUrl)}`
            : "";

    return {
        id: n.id,
        titulo: n.title,
        sinopse: n.description,
        capa: capaProxy || n.coverUrl,
        banner: n.bannerUrl || capaProxy,
        generos: n.genres,
        status: n.status,
        autor: n.author,
        capitulos: n.chapters.map((c) => ({
            id: c.id,
            numero: c.number,
            titulo: c.title,
            paginas: 0
        })),
        origem: n.source as MangaLegacy["origem"],
        atualizadoEm: new Date().toISOString()
    };
}

export function ingestToCanonical(n: IngestManga): MangaCanonical {
    return toCanonical(ingestToLegacy(n), n.source);
}

/** Sinopse real (não fallback genérico). */
export function hasRealSynopsis(n: IngestManga): boolean {
    return Boolean(
        n.description &&
        n.description !== MANGA_FALLBACKS.description &&
        n.description.length > 20
    );
}

/** Capa real (não vazia nem placeholder). */
export function hasRealCover(n: IngestManga): boolean {
    return Boolean(n.coverUrl && n.coverUrl !== MANGA_FALLBACKS.coverUrl);
}
