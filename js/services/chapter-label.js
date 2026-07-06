export function parseChapterNumber(cap) {
    const id = String(cap.id || "");
    const url = String(cap.url || "");

    // Sufixo -NN no ID (ex.: cap-d501f6c4-01 → 1) — prioridade sobre numero salvo errado
    const tailMatch = id.match(/-(\d+(?:\.\d+)?)$/);
    if (tailMatch) {
        const fromTail = Number(tailMatch[1]);
        if (fromTail > 0) return fromTail;
    }

    if (typeof cap.numero === "number" && cap.numero > 0) return cap.numero;
    if (typeof cap.number === "number" && cap.number > 0) return cap.number;

    const fromUrl = url.match(/capitulo-(\d+(?:\.\d+)?)/i)
        || url.match(/chapter-(\d+(?:\.\d+)?)/i)
        || url.match(/\/(\d+(?:\.\d+)?)\/?$/);
    if (fromUrl) return Number(fromUrl[1]);

    const capMatch = id.match(/^cap-(\d+(?:\.\d+)?)$/i);
    if (capMatch) return Number(capMatch[1]);

    const title = cap.titulo ?? cap.title ?? "";
    const titleMatch = String(title).match(/cap(?:ítulo|itulo)?\.?\s*(\d+(?:\.\d+)?)/i)
        || String(title).match(/^(\d+(?:\.\d+)?)/);
    if (titleMatch) return Number(titleMatch[1]);

    return 0;
}

/** Número do capítulo para exibição e ordenação (alias de parseChapterNumber). */
export function numeroCapituloLabel(cap) {
    const n = parseChapterNumber(cap);
    return n > 0 ? n : 1;
}

/** Corrige capitulo_atual salvo errado (ex.: 501) usando o ID do capítulo. */
export function normalizarNumeroProgresso(capituloAtual, chapterId = null) {
    if (chapterId) {
        const fromId = parseChapterNumber({ id: chapterId, numero: capituloAtual });
        if (fromId > 0) return fromId;
    }
    const n = Number(capituloAtual);
    return Number.isFinite(n) && n > 0 && n < 500 ? n : 1;
}

export function validateChapterListClient(capitulos = []) {
    if (!capitulos.length) return { ok: false, error: "Sem capítulos." };

    const numbers = capitulos.map((c) => parseChapterNumber(c)).filter((n) => n > 0);
    if (!numbers.length) return { ok: false, error: "Capítulos sem numeração válida." };

    const unique = new Set(numbers);
    if (unique.size === 1 && capitulos.length > 3 && numbers[0] >= 100) {
        return { ok: false, error: `Cap. ${numbers[0]} replicado em todos os itens.` };
    }

    return { ok: true };
}

/** URLs de placeholder/demo (não são páginas reais). */
export function isDemoChapterPageSet(pages = []) {
    const urls = pages.map((p) => (typeof p === "string" ? p : p?.url || "")).filter(Boolean);
    if (!urls.length) return false;
    return urls.every((u) => u.includes("placehold.co"));
}

/** Valida se páginas do capítulo são utilizáveis no leitor. */
export function isValidChapterPageSet(pages = []) {
    if (!Array.isArray(pages) || pages.length < 1) return false;
    const urls = pages.map((p) => (typeof p === "string" ? p : p?.url || "")).filter(Boolean);
    if (!urls.length) return false;
    const valid = urls.filter((u) => {
        const low = u.toLowerCase();
        if (low.includes("netassets")) return false;
        if (/\/covers?\//i.test(low) && !/\/uploads\/.*chapter/i.test(low)) return false;
        if (/\d{2,3}x\d{2,3}\.(webp|jpg|png)/i.test(low)) return false;
        if (/logo|avatar|banner|icon|favicon/i.test(low)) return false;
        return (
            low.includes("placehold.co")
            || /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(low)
            || u.startsWith("/biblioteca/")
            || u.startsWith("/backup/")
        );
    });
    return valid.length >= 1;
}

/** Páginas reais — exclui demo/placeholder cacheado. */
export function isRealChapterPageSet(pages = []) {
    if (isDemoChapterPageSet(pages)) return false;
    return isValidChapterPageSet(pages);
}
