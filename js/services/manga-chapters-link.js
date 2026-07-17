/**
 * Liga capítulos do catálogo ao índice remoto (cloud).
 * Legibilidade baseada em páginas Telegra.ph no índice.
 */
import { capsRemotosManga, mangaTemCapsRemotos } from "./cloud-chapters-service.js";
import { parseChapterNumber } from "./chapter-label.js";

function temPaginasHospedadas(remoto) {
    if (!remoto?.pages?.length) return false;
    return remoto.pages.some((p) => {
        const u = String(p.url || "");
        return u.includes("telegra.ph")
            || u.includes("catbox.moe")
            || u.includes("/api/cloud/page")
            || u.includes("/data/cloud/pages/");
    });
}

/** Capítulo pronto — exige pages[] com URLs reais no índice remoto. */
export function capLegivel(remoto) {
    if (!remoto?.done) return false;
    return temPaginasHospedadas(remoto);
}

export async function capsLegiveisIds(mangaId) {
    const remotos = await capsRemotosManga(mangaId);
    return new Set(remotos.filter(capLegivel).map((c) => c.capId));
}

/**
 * Enriquece mangá com capítulos remotos e flag `legivel` por capítulo.
 * @param {object} manga
 */
export async function enriquecerMangaComRemoto(manga) {
    if (!manga?.id) return manga;

    const remotos = await capsRemotosManga(manga.id);
    const remotoMap = new Map(remotos.map((r) => [r.capId, r]));
    const catalogById = new Map((manga.capitulos || []).map((c) => [c.id, c]));

    // GOLD RULE: só caps com páginas válidas no índice remoto.
    const legiveis = remotos.filter(capLegivel);
    const byNum = new Map();

    for (const r of legiveis) {
        const num = parseChapterNumber({ id: r.capId, numero: r.numero });
        if (!Number.isFinite(num) || num <= 0) continue;

        const catalogCap = catalogById.get(r.capId);
        const entry = {
            id: r.capId,
            numero: num,
            titulo: catalogCap?.titulo ?? r.titulo ?? null,
            publicadoEm: catalogCap?.publicadoEm || r.hostedAt || manga.atualizadoEm || new Date().toISOString(),
            novo: catalogCap?.novo ?? false,
            origem: catalogCap?.origem || r.origem || "nexustoons",
            hosting: r.hosting || catalogCap?.hosting || "telegra",
            legivel: true
        };

        const prev = byNum.get(num);
        if (!prev || entry.legivel) byNum.set(num, entry);
    }

    const enriched = [...byNum.values()].sort((a, b) => parseChapterNumber(b) - parseChapterNumber(a));
    const syncProntos = enriched.length;

    return {
        ...manga,
        capitulos: enriched,
        totalCapitulos: syncProntos,
        syncProntos
    };
}

/** Resumo rápido de sync a partir do índice (sem enriquecer lista completa). */
export async function syncResumoManga(mangaId) {
    try {
        const remotos = await capsRemotosManga(mangaId);
        if (!remotos.length) return { total: 0, prontos: 0 };
        const prontos = remotos.filter(capLegivel).length;
        return { total: remotos.length, prontos };
    } catch {
        return { total: 0, prontos: 0 };
    }
}

export { mangaTemCapsRemotos };
