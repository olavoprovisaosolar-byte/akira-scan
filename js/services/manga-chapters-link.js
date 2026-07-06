/**
 * Liga capítulos do catálogo ao índice remoto (cloud).
 */
import { capsRemotosManga } from "./cloud-chapters-service.js";
import { parseChapterNumber } from "./chapter-label.js";
import { isStaticHost } from "../site-config.js";

/** Capítulo pronto para leitura no site estático. */
export function capLegivel(remoto) {
    if (!remoto?.done) return false;
    if (remoto.pages?.length) return true;
    if (!remoto.localPurged) return true;
    return false;
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
    if (!remotos.length) return manga;

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

    const staticHost = isStaticHost();
    const enriched = caps.map((c) => {
        const r = remotoMap.get(c.id);
        if (r) {
            return { ...c, legivel: capLegivel(r) };
        }
        return { ...c, legivel: staticHost ? false : true };
    });

    enriched.sort((a, b) => parseChapterNumber(b) - parseChapterNumber(a));

    return {
        ...manga,
        capitulos: enriched,
        totalCapitulos: Math.max(manga.totalCapitulos || 0, enriched.length)
    };
}
