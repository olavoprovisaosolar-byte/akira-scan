/**
 * DataValidator — validação antes de renderizar na UI.
 */
import { parseChapterNumber, validateChapterListClient } from "./chapter-label.js";
import { MANGA_FALLBACKS } from "./manga-schema.js";

const PLACEHOLDER_COVER = /placehold\.co\/.*text=\?|placeholder|no-?image|default-cover/i;

export function validateMangaPayload(manga) {
    if (!manga || typeof manga !== "object") {
        return { ok: false, error: "Dados inválidos.", placeholder: true };
    }

    if (!manga.id || !manga.titulo) {
        return { ok: false, error: "Mangá incompleto.", placeholder: true };
    }

    return { ok: true };
}

export function sanitizeMangaForRender(manga, expectedId) {
    const check = validateMangaPayload(manga);
    if (!check.ok) {
        throw new Error(check.error || "Mangá inválido para renderização.");
    }
    if (expectedId && manga.id !== expectedId) {
        throw new Error(`ID inconsistente: esperado ${expectedId}, recebido ${manga.id}.`);
    }

    let capitulos = (manga.capitulos || []).map((cap) => ({
        ...cap,
        numero: parseChapterNumber(cap)
    })).filter((c) => c.numero > 0);

    if (!capitulos.length && (manga.capitulos || []).length) {
        capitulos = manga.capitulos;
    }

    const cover = manga.capa || manga.banner || "";
    const capa = cover && !PLACEHOLDER_COVER.test(cover)
        ? cover
        : (MANGA_FALLBACKS.coverUrl || cover);

    const capCheck = validateChapterListClient(capitulos);
    if (!capCheck.ok && capitulos.length > 3) {
        console.warn("[DataValidator]", capCheck.error);
    }

    return {
        ...manga,
        capa,
        banner: manga.banner || capa,
        sinopse: manga.sinopse || MANGA_FALLBACKS.description,
        capitulos
    };
}

export function renderUnavailableMessage(reason = "Conteúdo indisponível") {
    return `
    <div class="akira-state akira-state-error" role="status">
        <p class="msg-vazia">${reason}</p>
        <p class="msg-vazia-muted">Conteúdo em carregamento ou indisponível no momento.</p>
    </div>`;
}
