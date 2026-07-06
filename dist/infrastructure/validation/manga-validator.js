/**
 * Validação de integridade — aborta save se capítulos vazios ou id corrompido.
 */
import { logger } from "../../core/logger.js";
export function validateMangaCanonical(data, expectedId) {
    const errors = [];
    if (!data || typeof data !== "object") {
        return { ok: false, errors: ["Objeto inválido."] };
    }
    const m = data;
    if (typeof m.id !== "string" || !m.id.trim()) {
        errors.push("id ausente ou inválido.");
    }
    else if (expectedId && m.id !== expectedId) {
        errors.push(`id inconsistente: esperado ${expectedId}, recebido ${m.id}.`);
    }
    if (typeof m.title !== "string" || !m.title.trim()) {
        errors.push("title ausente.");
    }
    if (typeof m.coverUrl !== "string") {
        errors.push("coverUrl deve ser string.");
    }
    if (!Array.isArray(m.chapters)) {
        errors.push("chapters deve ser array.");
    }
    else if (m.chapters.length === 0) {
        errors.push("chapters vazio — possível mudança de layout HTML.");
    }
    else {
        for (const ch of m.chapters) {
            if (!ch || typeof ch !== "object") {
                errors.push("capítulo inválido no array.");
                break;
            }
            const c = ch;
            if (typeof c.id !== "string" || !c.id) {
                errors.push("capítulo sem id.");
                break;
            }
        }
    }
    if (errors.length) {
        logger.scraperError(String(m.source || "unknown"), errors.join(" "), { id: m.id });
    }
    return { ok: errors.length === 0, errors };
}
/** Lança se inválido — impede corrupção no Firestore. */
export function assertValidManga(data, expectedId) {
    const result = validateMangaCanonical(data, expectedId);
    if (!result.ok) {
        throw new Error(`[ScraperError] Validação falhou: ${result.errors.join(" ")}`);
    }
}
