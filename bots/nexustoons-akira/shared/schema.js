/**
 * Contrato JSON entre módulos capture → hosting → upload.
 */

/** @typedef {{ index: number, url: string, origem?: string }} ChapterPage */

/** @typedef {{ index: number, url: string, origem: string }} HostedChapterPage */

/** @typedef {{
 *   mangaId: string,
 *   capId: string,
 *   numero: number,
 *   titulo: string,
 *   pages: ChapterPage[],
 *   source?: string,
 *   capturedAt?: string
 * }} CapturedChapter */

/** @typedef {{
 *   mangaId: string,
 *   capId: string,
 *   numero: number,
 *   titulo: string,
 *   pages: HostedChapterPage[],
 *   source?: string,
 *   capturedAt?: string,
 *   hosting?: string,
 *   hostedAt?: string
 * }} HostedChapter */

/** @typedef {{
 *   id: string,
 *   slug: string,
 *   title: string,
 *   coverImage?: string,
 *   description?: string,
 *   author?: string,
 *   status?: string,
 *   chapters: Array<{ id: number|string, number: string|number, title?: string|null }>
 * }} CapturedMangaMeta */

export function validateChapter(ch) {
    const errors = [];
    if (!ch || typeof ch !== "object") return ["objeto invalido"];
    if (!ch.mangaId || typeof ch.mangaId !== "string") errors.push("mangaId obrigatorio");
    if (!ch.capId || typeof ch.capId !== "string") errors.push("capId obrigatorio");
    if (ch.numero == null || Number.isNaN(Number(ch.numero))) errors.push("numero invalido");
    if (!Array.isArray(ch.pages) || ch.pages.length === 0) errors.push("pages vazio");
    else {
        ch.pages.forEach((p, i) => {
            if (p.index == null) p.index = i;
            if (!p.url || !String(p.url).startsWith("http")) errors.push(`pages[${i}].url invalida`);
        });
    }
    return errors;
}

export function validateHostedChapter(ch) {
    const errors = validateChapter(ch);
    if (errors.length) return errors;
    ch.pages.forEach((p, i) => {
        if (!p.origem) errors.push(`pages[${i}].origem obrigatorio`);
    });
    return errors;
}

export function normalizeChapter(raw) {
    const numero = Number(raw.numero);
    return {
        mangaId: String(raw.mangaId),
        capId: String(raw.capId),
        numero,
        titulo: raw.titulo || raw.title || `Capítulo ${numero}`,
        pages: (raw.pages || []).map((p, i) => ({
            index: p.index ?? i,
            url: String(p.url)
        })),
        source: raw.source || "nexustoons",
        capturedAt: raw.capturedAt || new Date().toISOString()
    };
}

export function normalizeHostedChapter(raw) {
    const base = normalizeChapter(raw);
    return {
        ...base,
        pages: (raw.pages || []).map((p, i) => ({
            index: p.index ?? i,
            url: String(p.url),
            origem: p.origem || raw.hosting || "telegra"
        })),
        hosting: raw.hosting || "telegra",
        hostedAt: raw.hostedAt || new Date().toISOString()
    };
}

export function chapterKey(mangaId, capId) {
    return `${mangaId}/${capId}`;
}

export function isTelegraUrl(url) {
    return String(url || "").includes("telegra.ph");
}

/** URL legível no leitor: Telegra, catbox, API R2 ou páginas estáticas legadas. */
export function isLegiblePageUrl(url) {
    const u = String(url || "");
    return u.includes("telegra.ph")
        || u.includes("catbox.moe")
        || u.includes("/api/cloud/page")
        || u.includes("/data/cloud/pages/")
        || u.includes("akira-scan.pages.dev/data/cloud/pages/");
}

export function chapterHasTelegraPages(ch) {
    return Array.isArray(ch?.pages) && ch.pages.some((p) => isTelegraUrl(p.url));
}

export function chapterHasHostedPages(ch) {
    return Array.isArray(ch?.pages) && ch.pages.some((p) => isLegiblePageUrl(p.url));
}
