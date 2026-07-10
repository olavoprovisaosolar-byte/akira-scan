/**
 * Capítulos em armazenamento remoto (data/cloud/chapters-index.json).
 */
import { assetUrl, cloudApiDisponivel, cloudApiUrl, isStaticHost } from "../site-config.js";
import { isRealChapterPageSet } from "./chapter-label.js";

const INDEX_URL = () => assetUrl("data/cloud/chapters-index.json");
const CACHE_MS = 120000;

let cacheIndex = null;
let cacheTs = 0;
let inflight = null;

async function carregarIndice(force = false) {
    if (!force && cacheIndex && Date.now() - cacheTs < CACHE_MS) {
        return cacheIndex;
    }
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch(`${INDEX_URL()}?v=${Date.now().toString(36)}`, { cache: "no-store" });
            if (!res.ok) return null;
            cacheIndex = await res.json();
            cacheTs = Date.now();
            return cacheIndex;
        } catch {
            return null;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}

export async function capRemotoInfo(mangaId, capId) {
    const idx = await carregarIndice();
    if (!idx?.caps) return null;
    return idx.caps[`${mangaId}/${capId}`] || null;
}

export async function capsRemotosManga(mangaId) {
    const idx = await carregarIndice();
    if (!idx?.caps) return [];
    return Object.values(idx.caps).filter((c) => c.mangaId === mangaId);
}

export async function mangaTemCapsRemotos(mangaId) {
    const idx = await carregarIndice();
    return !!(idx?.porManga?.[mangaId]?.doneCaps);
}

export async function obterPaginasRemotas(mangaId, capId) {
    const info = await capRemotoInfo(mangaId, capId);
    if (!info) return null;

    if (info.done && cloudApiDisponivel() && (isStaticHost() || info.localPurged)) {
        try {
            const res = await fetch(
                cloudApiUrl("api/cloud/pages", { m: mangaId, ch: capId }),
                { cache: "no-store" }
            );
            if (res.ok) {
                const data = await res.json();
                if (isRealChapterPageSet(data.pages)) {
                    return data.pages.map((p, i) => ({
                        index: p.index ?? i,
                        url: p.url,
                        origem: "remoto"
                    }));
                }
            }
        } catch (e) {
            console.warn("[Cloud] API páginas:", e.message);
        }
    }

    if (info.pages?.length && isRealChapterPageSet(info.pages)) {
        return info.pages.map((p, i) => ({
            index: p.index ?? i,
            url: p.url,
            origem: "remoto"
        }));
    }

    if (info.done && !info.localPurged) {
        const base = assetUrl(`data/toonlivre-backup/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(capId)}/pages`);
        const total = info.total || info.uploaded || 0;
        if (total > 0) {
            const pages = [];
            for (let i = 1; i <= total; i++) {
                const n = String(i).padStart(3, "0");
                pages.push({ index: i - 1, url: `${base}/${n}.webp`, origem: "backup" });
            }
            return pages;
        }
    }

    return null;
}

export async function obterShareRemoto(mangaId, capId) {
    const info = await capRemotoInfo(mangaId, capId);
    return info?.shareUrl || null;
}

/** Caps prontos para leitura (com API, páginas em cache ou backup local). */
export async function capsLegiveisManga(mangaId) {
    const caps = await capsRemotosManga(mangaId);
    return caps.filter((c) => c.done && (cloudApiDisponivel() ? !!c.remote : (c.pages?.length || !c.localPurged)));
}

export function invalidarCacheRemoto() {
    cacheIndex = null;
    cacheTs = 0;
}
