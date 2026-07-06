/**
 * Catálogo Terabox — caps enviados ao cloud (data/terabox/chapters-index.json).
 */
import { assetUrl } from "../site-config.js";
import { isRealChapterPageSet } from "./chapter-label.js";

const INDEX_URL = () => assetUrl("/data/terabox/chapters-index.json");
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

export async function capTeraboxInfo(mangaId, capId) {
    const idx = await carregarIndice();
    if (!idx?.caps) return null;
    return idx.caps[`${mangaId}/${capId}`] || null;
}

export async function capsTeraboxManga(mangaId) {
    const idx = await carregarIndice();
    if (!idx?.caps) return [];
    return Object.values(idx.caps).filter((c) => c.mangaId === mangaId);
}

export async function mangaTemTerabox(mangaId) {
    const idx = await carregarIndice();
    return !!(idx?.porManga?.[mangaId]?.doneCaps);
}

export async function obterPaginasTerabox(mangaId, capId) {
    const info = await capTeraboxInfo(mangaId, capId);
    if (!info) return null;

    if (info.pages?.length && isRealChapterPageSet(info.pages)) {
        return info.pages.map((p, i) => ({
            index: p.index ?? i,
            url: p.url,
            origem: "terabox"
        }));
    }

    if (info.done && !info.localPurged) {
        const base = assetUrl(`backup/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(capId)}/pages`);
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

export async function obterShareTerabox(mangaId, capId) {
    const info = await capTeraboxInfo(mangaId, capId);
    return info?.shareUrl || null;
}

export function invalidarCacheTerabox() {
    cacheIndex = null;
    cacheTs = 0;
}
