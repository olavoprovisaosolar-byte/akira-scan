/**
 * Liga capítulos do catálogo ao índice remoto (cloud).
 */
import { capsRemotosManga, mangaTemCapsRemotos } from "./cloud-chapters-service.js";
import { parseChapterNumber } from "./chapter-label.js";
import { cloudApiDisponivel, isStaticHost } from "../site-config.js";

/** Capítulo pronto para leitura (cloud / backup / API). */
export function capLegivel(remoto) {
    if (!remoto) return !isStaticHost();
    if (!remoto.done) {
        // Em servidor local ainda dá para ler via backup/proxy enquanto o upload corre.
        return !isStaticHost();
    }
    if (!remoto.localPurged) return true;
    if (cloudApiDisponivel() && remoto.remote) return true;
    return !!(remoto.pages?.length);
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
    const staticHost = isStaticHost();
    const remotoMap = new Map(remotos.map((r) => [r.capId, r]));
    const caps = [...(manga.capitulos || [])];
    const byId = new Map(caps.map((c) => [c.id, c]));

    for (const r of remotos) {
        if (byId.has(r.capId)) continue;
        const num = Number(r.numero);
        caps.push({
            id: r.capId,
            numero: Number.isFinite(num) ? num : r.numero,
            publicadoEm: manga.atualizadoEm || new Date().toISOString()
        });
    }

    // Sem índice remoto: no Pages marca tudo como não legível (evita links mortos).
    if (!remotos.length) {
        if (!staticHost) return manga;
        return {
            ...manga,
            capitulos: caps.map((c) => ({ ...c, legivel: false })),
            totalCapitulos: Math.max(manga.totalCapitulos || 0, caps.length),
            syncProntos: 0
        };
    }

    const enriched = caps.map((c) => {
        const r = remotoMap.get(c.id);
        if (r) {
            return { ...c, legivel: capLegivel(r) };
        }
        return { ...c, legivel: staticHost ? false : true };
    });

    enriched.sort((a, b) => parseChapterNumber(b) - parseChapterNumber(a));
    const syncProntos = enriched.filter((c) => c.legivel === true).length;

    return {
        ...manga,
        capitulos: enriched,
        totalCapitulos: Math.max(manga.totalCapitulos || 0, enriched.length),
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
