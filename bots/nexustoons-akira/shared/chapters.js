/**
 * Utilitários de ordenação e seleção de capítulos NexusToons.
 */

/** Compara números de capítulo (suporta decimais como 15.5). */
export function compareChapterNumbers(a, b) {
    return Number(a) - Number(b);
}

/** Ordena capítulos do mais antigo ao mais recente (1, 2, 3 … 15.5). */
export function sortChaptersAsc(chapters) {
    return [...chapters].sort((a, b) => compareChapterNumbers(a.number, b.number));
}

/** Ordena capítulos do mais recente ao mais antigo. */
export function sortChaptersDesc(chapters) {
    return [...chapters].sort((a, b) => compareChapterNumbers(b.number, a.number));
}

/**
 * Seleciona capítulos conforme modo CLI.
 * @param {Array<{ number: string|number }>} chapters
 * @param {{ allChapters?: boolean, allRecent?: boolean }} opts
 */
export function selectChaptersForRun(chapters, { allChapters = false, allRecent = false, latestOnly = false } = {}) {
    if (!chapters?.length) return [];

    if (allChapters) {
        return sortChaptersAsc(chapters);
    }

    const sorted = sortChaptersDesc(chapters);
    if (allRecent) {
        return sorted;
    }
    // padrão / --latest-only: só o mais recente
    if (latestOnly || !allRecent) {
        return [sorted[0]];
    }
    return sorted;
}
