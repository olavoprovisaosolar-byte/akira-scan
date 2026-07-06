/** Validação compartilhada — espelha shared/types/manga.ts */
/** @typedef {import('../types/manga.d.ts').Manga} Manga */

/**
 * @param {unknown} data
 * @param {string} [expectedId]
 * @returns {asserts data is Manga}
 */
export function assertManga(data, expectedId) {
    if (!data || typeof data !== "object") {
        throw new Error("Estrutura de dados corrompida.");
    }
    const m = /** @type {Record<string, unknown>} */ (data);
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
