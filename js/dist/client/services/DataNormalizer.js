/**
 * DataNormalizer — garante estrutura uniforme independente da fonte.
 */
import { MANGA_FALLBACKS } from "../../shared/mangaSchema.js";
function str(v, fallback) {
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
function num(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
/** Normaliza payload de qualquer fonte (proxy canônico, legacy PT, API). */
export function normalizeManga(raw, expectedId) {
    if (!raw || typeof raw !== "object") {
        throw new Error("Dados do mangá inválidos.");
    }
    const m = raw;
    const id = str(m.id, expectedId || "");
    if (!id)
        throw new Error("ID do mangá ausente.");
    if (expectedId && id !== expectedId) {
        throw new Error(`ID inconsistente: esperado ${expectedId}, recebido ${id}.`);
    }
    const title = str(m.title ?? m.titulo, MANGA_FALLBACKS.title);
    const description = str(m.description ?? m.sinopse ?? m.synopsis, MANGA_FALLBACKS.description);
    const coverUrl = str(m.coverUrl ?? m.capa, MANGA_FALLBACKS.coverUrl);
    const bannerUrl = str(m.bannerUrl ?? m.banner ?? m.capa, coverUrl || MANGA_FALLBACKS.bannerUrl);
    const genre = Array.isArray(m.genre)
        ? m.genre
        : Array.isArray(m.generos)
            ? m.generos
            : Array.isArray(m.genres)
                ? m.genres
                : [MANGA_FALLBACKS.genre];
    const rawChapters = (m.chapters ?? m.capitulos ?? []);
    const chapters = rawChapters.map((ch) => {
        const c = ch;
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
        status: legacy.status,
        author: legacy.autor,
        chapters,
        source,
        _legacy: legacy
    };
}
/** Mangá completo o suficiente para exibir em Populares/Destaques. */
export function isCompleteManga(m) {
    return Boolean(m.id &&
        m.title &&
        m.title !== MANGA_FALLBACKS.title &&
        (m.bannerUrl || m.coverUrl) &&
        m.chapters.length > 0);
}
/** Converte de volta para formato legacy consumido pelas views atuais. */
export function toLegacyManga(n) {
    return { ...n._legacy, id: n.id };
}
