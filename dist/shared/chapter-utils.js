/**
 * Utilitários de capítulo — parsing e validação anti-Cap.501.
 */
/** Extrai número do capítulo sem concatenar dígitos do UUID (bug Cap.501). */
export function parseChapterNumber(cap) {
    const id = String(cap.id || "");
    const url = String(cap.url || "");
    const tailMatch = id.match(/-(\d+(?:\.\d+)?)$/);
    if (tailMatch) {
        const fromTail = Number(tailMatch[1]);
        if (fromTail > 0)
            return fromTail;
    }
    if (typeof cap.numero === "number" && cap.numero > 0)
        return cap.numero;
    if (typeof cap.number === "number" && cap.number > 0)
        return cap.number;
    const fromUrl = url.match(/capitulo-(\d+(?:\.\d+)?)/i)
        || url.match(/chapter-(\d+(?:\.\d+)?)/i)
        || url.match(/\/(\d+(?:\.\d+)?)\/?$/);
    if (fromUrl)
        return Number(fromUrl[1]);
    const capMatch = id.match(/^cap-(\d+(?:\.\d+)?)$/i);
    if (capMatch)
        return Number(capMatch[1]);
    const title = cap.titulo ?? cap.title ?? "";
    const titleMatch = String(title).match(/cap(?:ítulo|itulo)?\.?\s*(\d+(?:\.\d+)?)/i)
        || String(title).match(/^(\d+(?:\.\d+)?)/);
    if (titleMatch)
        return Number(titleMatch[1]);
    return 0;
}
/** Detecta listas corrompidas (todos Cap. 501, números duplicados em massa). */
export function validateChapterList(chapters) {
    if (!chapters.length) {
        return { ok: false, error: "Lista de capítulos vazia." };
    }
    const numbers = chapters.map((c) => c.number).filter((n) => n > 0);
    if (!numbers.length) {
        return { ok: false, error: "Nenhum capítulo com número válido." };
    }
    const unique = new Set(numbers);
    if (unique.size === 1 && chapters.length > 3) {
        const n = numbers[0];
        if (n >= 100) {
            return {
                ok: false,
                error: `Possível falha de seleção de elemento — todos os ${chapters.length} capítulos são Cap. ${n}.`
            };
        }
    }
    if (chapters.length > 10 && unique.size < Math.min(chapters.length * 0.4, chapters.length - 2)) {
        return { ok: false, error: "Muitos números de capítulo duplicados — payload corrompido." };
    }
    const first = chapters[0];
    if (first.number >= 500 && chapters.length > 5) {
        const allSame = chapters.every((c) => c.number === first.number);
        if (allSame) {
            return { ok: false, error: "Cap. 501 replicado — triggerError: falha de seleção de elemento." };
        }
    }
    const titles = chapters.map((c) => c.title).filter(Boolean);
    if (titles.length > 5) {
        const uniqueTitles = new Set(titles);
        if (uniqueTitles.size === 1 && chapters.length > 5) {
            return { ok: false, error: "Todos os capítulos têm o mesmo título — scraper pegou um único elemento." };
        }
    }
    return { ok: true };
}
/** Divide array em lotes (persistência incremental). */
export function batchChapters(items, batchSize = 50) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    return batches;
}
