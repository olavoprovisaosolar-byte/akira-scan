/**
 * Liga capítulos do catálogo ao índice remoto (cloud).
 * Legibilidade: só URLs remotas vivas (Telegra / Freeimage / Catbox / R2).
 */
import { capsRemotosManga, mangaTemCapsRemotos } from "./cloud-chapters-service.js";
import { parseChapterNumber } from "./chapter-label.js";

function urlRemotaViva(url) {
    const u = String(url || "");
    return u.includes("telegra.ph")
        || u.includes("catbox.moe")
        || u.includes("litter.catbox.moe")
        || u.includes("pixeldrain.com")
        || u.includes("iili.io")
        || u.includes("freeimage.host")
        || u.includes("/api/cloud/page");
}

function temPaginasHospedadas(remoto) {
    if (!remoto?.pages?.length) return false;
    return remoto.pages.some((p) => urlRemotaViva(p.url));
}

/** Capítulo pronto — só URLs remotas vivas (nunca cloud-static purged). */
export function capLegivel(remoto) {
    if (!remoto?.done) return false;
    return temPaginasHospedadas(remoto);
}

export async function capsLegiveisIds(mangaId) {
    const remotos = await capsRemotosManga(mangaId);
    return new Set(remotos.filter(capLegivel).map((c) => c.capId));
}

/**
 * Enriquece mangá: lista completa do catálogo + flag legivel por cap remoto vivo.
 * Caps só no índice remoto (ainda não no catálogo) também entram se legíveis.
 */
export async function enriquecerMangaComRemoto(manga) {
    if (!manga?.id) return manga;

    const remotos = await capsRemotosManga(manga.id);
    const remotoMap = new Map(remotos.map((r) => [r.capId, r]));
    const byNum = new Map();

    for (const c of manga.capitulos || []) {
        const num = parseChapterNumber(c);
        if (!Number.isFinite(num) || num <= 0) continue;
        const remoto = remotoMap.get(c.id)
            || remotos.find((r) => String(r.numero) === String(num));
        const legivel = remoto ? capLegivel(remoto) : false;
        byNum.set(num, {
            id: c.id,
            numero: num,
            titulo: c.titulo ?? remoto?.titulo ?? null,
            publicadoEm: c.publicadoEm || remoto?.hostedAt || manga.atualizadoEm || new Date().toISOString(),
            novo: c.novo ?? false,
            origem: c.origem || remoto?.origem || "catalogo",
            hosting: remoto?.hosting || c.hosting || null,
            legivel
        });
    }

    for (const r of remotos) {
        if (!capLegivel(r)) continue;
        const num = parseChapterNumber({ id: r.capId, numero: r.numero });
        if (!Number.isFinite(num) || num <= 0) continue;
        const prev = byNum.get(num);
        if (prev?.legivel) continue;
        byNum.set(num, {
            id: r.capId,
            numero: num,
            titulo: r.titulo ?? prev?.titulo ?? null,
            publicadoEm: prev?.publicadoEm || r.hostedAt || manga.atualizadoEm || new Date().toISOString(),
            novo: prev?.novo ?? false,
            origem: r.origem || "nexustoons",
            hosting: r.hosting || "telegra",
            legivel: true
        });
    }

    const enriched = [...byNum.values()].sort((a, b) => parseChapterNumber(b) - parseChapterNumber(a));
    const syncProntos = enriched.filter((c) => c.legivel).length;

    return {
        ...manga,
        capitulos: enriched,
        totalCapitulos: enriched.length,
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
