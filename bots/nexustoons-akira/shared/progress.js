/**
 * Logs de progresso para importação bulk.
 * Formato: [PROCESSANDO] Cap 05 | Página 12/24 | [||||||||....] 50% | Fallback: Não
 */
import { log } from "./logger.js";

const BAR_WIDTH = 12;

function padChapter(num) {
    const s = String(num);
    return s.length >= 2 ? s : s.padStart(2, "0");
}

function buildBar(percent) {
    const filled = Math.round((percent / 100) * BAR_WIDTH);
    return `[${"|".repeat(filled)}${".".repeat(BAR_WIDTH - filled)}]`;
}

/**
 * @param {{ chapterNumber: string|number, page: number, totalPages: number, fallback?: boolean }} opts
 */
export function logPageProgress({ chapterNumber, page, totalPages, fallback = false }) {
    const pct = totalPages > 0 ? Math.round((page / totalPages) * 100) : 0;
    const fallbackLabel = fallback ? "Sim" : "Não";
    const line = `Cap ${padChapter(chapterNumber)} | Página ${page}/${totalPages} | ${buildBar(pct)} ${pct}% | Fallback: ${fallbackLabel}`;
    log.tag("PROCESSANDO", line);
}

export function logChapterStart(chapterNumber, totalPages) {
    log.info(`Iniciando capítulo ${chapterNumber} (${totalPages} páginas)`);
}

export function logChapterDone(chapterNumber, hosting) {
    log.success(`Capítulo ${chapterNumber} concluído`, { hosting });
}

export function logChapterSkipped(chapterNumber, reason) {
    log.info(`skip capítulo ${chapterNumber} (${reason})`);
}
