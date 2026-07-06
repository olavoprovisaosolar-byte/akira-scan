/**
 * MangaService — motor de dados + proxy externo + offline.
 */
import { store, Events } from "../core/state-manager.js";
import { OfflineStore } from "../core/offline-store.js";
import { obterManga as obterMangaData, obterPaginasLeitura, numeroCapituloLabel } from "./data-service.js";
import { parseChapterNumber, isValidChapterPageSet, isRealChapterPageSet } from "./chapter-label.js";
import { mangaStore } from "../core/manga-store.js";
import { assertManga } from "./validate.js";
import { createChapterLoader } from "../hooks/index.js";
import { normalizeManga, toLegacyManga } from "./data-normalizer.js";

let pendingMangaId = null;

function resolveSource(manga) {
    const map = {
        mangalivre: "mangalivre",
        toonlivre: "toonlivre",
        mangalivreto: "mangalivreto",
        mangalivreblog: "mangalivreblog",
        bladetoons: "bladetoons"
    };
    return map[manga?.origem] || "auto";
}

/** Converte schema canônico do proxy TS → formato interno PT. */
function normalizeProxyManga(data) {
    if (!data || typeof data !== "object") return data;
    if (data.titulo) return data;

    if (data.title) {
        return {
            id: data.id,
            titulo: data.title,
            sinopse: data.synopsis || "",
            autor: "",
            artista: "",
            generos: data.genres || [],
            status: data.status || "Em lançamento",
            capa: data.coverUrl || "",
            banner: data.coverUrl || "",
            popularidade: 50,
            capitulos: (data.chapters || []).map((ch) => {
                const cap = {
                    id: ch.id,
                    numero: ch.number,
                    titulo: ch.title ?? null,
                    url: ch.url
                };
                return {
                    id: ch.id,
                    numero: parseChapterNumber(cap),
                    titulo: ch.title ?? null,
                    paginas: Array.isArray(ch.pages) ? ch.pages.length : 0
                };
            }).filter((c) => c.numero > 0),
            atualizadoEm: new Date().toISOString(),
            origem: data.source || "api"
        };
    }
    return data;
}

async function fetchMangaFromProxy(mangaId, source = "auto", timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(
            `/api/v1/proxy/manga/${encodeURIComponent(mangaId)}?source=${encodeURIComponent(source)}`,
            { signal: controller.signal }
        );
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || `Proxy HTTP ${res.status}`);
        }
        const manga = normalizeProxyManga(data.legacy || data.manga);
        return { manga, cached: data.cached, source: data.source };
    } finally {
        clearTimeout(timer);
    }
}

async function fetchCapituloFromProxy(mangaId, chapterId, numeroCap, source = "auto", timeoutMs = 45000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const params = new URLSearchParams({
            n: String(numeroCap),
            source
        });
        const res = await fetch(
            `/api/v1/proxy/manga/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(chapterId)}?${params}`,
            { signal: controller.signal }
        );
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || `Proxy capítulo HTTP ${res.status}`);
        }
        if (!data.pages?.length) throw new Error("Proxy retornou capítulo vazio.");
        return { pages: data.pages, cached: data.cached, source: data.source };
    } finally {
        clearTimeout(timer);
    }
}

async function fetchCapituloRemote(mangaId, numeroCap, chapterId, source = "auto", manga = null) {
    try {
        const local = await obterPaginasLeitura(mangaId, numeroCap, chapterId);
        if (isRealChapterPageSet(local)) return local;
        console.warn("[MangaService] Catálogo local sem páginas reais, tentando proxy…");
    } catch (localErr) {
        console.warn("[MangaService] Catálogo capítulo:", localErr.message);
    }

    try {
        const proxy = await fetchCapituloFromProxy(mangaId, chapterId, numeroCap, source);
        if (isRealChapterPageSet(proxy.pages)) return proxy.pages;
        console.warn("[MangaService] Proxy páginas inválidas, usando demo.");
    } catch (proxyErr) {
        console.warn("[MangaService] Proxy capítulo:", proxyErr.message);
    }

    const { paginasDemo } = await import("../mangas-destaque.js");
    return paginasDemo(mangaId, chapterId);
}

const _chapterLoader = createChapterLoader({
    getOffline: (mangaId, chapterId) => OfflineStore.getCapitulo(mangaId, chapterId),
    fetchRemote: (mangaId, numeroCap, chapterId, opts = {}) => {
        const src = opts.source === "auto" && opts.manga
            ? resolveSource(opts.manga)
            : (opts.source || "auto");
        return fetchCapituloRemote(mangaId, numeroCap, chapterId, src);
    },
    saveOffline: (mangaId, chapterId, pages) => OfflineStore.saveCapitulo(mangaId, chapterId, pages)
});

async function fetchFromApi(mangaId) {
    const res = await fetch(`/api/manga/${encodeURIComponent(mangaId)}`);
    if (!res.ok) {
        throw new Error(res.status === 404 ? "Mangá não encontrado." : "Falha crítica na rede.");
    }
    const payload = await res.json();
    return payload.manga || payload;
}

export const MangaService = {
    _abortPending(mangaId) {
        if (pendingMangaId && pendingMangaId !== mangaId) {
            store.reset();
        }
        pendingMangaId = mangaId;
    },

    async getMangaDetails(mangaId, { source = "auto" } = {}) {
        if (!mangaId) throw new Error("ID do mangá ausente.");

        this._abortPending(mangaId);
        const req = store.beginRequest();

        store.setState({ status: "loading", loading: true, mangaId, error: null });
        store.dispatch(Events.MANGA_LOADING, { mangaId });

        try {
            let data = null;
            let fonte = "api";

            try {
                data = await fetchFromApi(mangaId);
                fonte = "api";
            } catch (apiErr) {
                console.warn("[MangaService] API local:", apiErr.message);
                try {
                    data = await obterMangaData(mangaId);
                    fonte = "data-service";
                } catch (localErr) {
                    console.warn("[MangaService] Catálogo local:", localErr.message);
                    const proxy = await fetchMangaFromProxy(mangaId, source);
                    data = proxy.manga;
                    fonte = proxy.cached ? `cache:${proxy.source}` : `proxy:${proxy.source}`;
                }
            }

            const capsLocais = data?.capitulos?.length || 0;
            if (capsLocais < 3) {
                try {
                    const proxy = await fetchMangaFromProxy(mangaId, source, 12000);
                    const proxyCaps = proxy.manga?.capitulos?.length || 0;
                    if (proxyCaps > capsLocais) {
                        data = proxy.manga;
                        fonte = proxy.cached ? `cache:${proxy.source}` : `proxy:${proxy.source}`;
                    }
                } catch (proxyErr) {
                    console.warn("[MangaService] Proxy enriquecimento:", proxyErr.message);
                }
            }

            if (req.isStale()) return null;

            const normalized = normalizeManga(data, mangaId);
            const manga = toLegacyManga(normalized);
            assertManga(manga, mangaId);
            mangaStore.set(manga);
            await this.saveForOffline(manga);

            if (req.isStale()) return null;

            store.setState({ status: "loaded", loading: false, manga, mangaId, fonte, error: null });
            store.dispatch(Events.MANGA_LOADED, { manga, fonte });
            return manga;
        } catch (error) {
            if (req.isStale()) return null;

            try {
                const offline = await OfflineStore.getManga(mangaId);
                if (offline) {
                    const normalized = normalizeManga(offline, mangaId);
                    const manga = toLegacyManga(normalized);
                    assertManga(manga, mangaId);
                    store.setState({ status: "loaded", loading: false, manga, mangaId, fonte: "offline", error: null });
                    store.dispatch(Events.MANGA_LOADED, { manga, fonte: "offline" });
                    return manga;
                }
            } catch { /* continua */ }

            console.error("[MangaService] Erro severo:", error);
            store.setState({ status: "error", loading: false, error: error.message });
            store.dispatch(Events.MANGA_ERROR, { mangaId, error: error.message });
            throw error;
        }
    },

    async getCapituloPaginas(mangaId, numeroCap, chapterId, { source = "auto", manga = null } = {}) {
        const req = store.beginRequest();
        store.dispatch(Events.LEITOR_LOADING, { mangaId, numeroCap, chapterId });

        try {
            const paginas = await _chapterLoader.load(mangaId, numeroCap, chapterId, { source, manga });

            if (req.isStale()) return null;
            if (!paginas?.length) throw new Error("Capítulo sem páginas.");

            const state = _chapterLoader.getState();
            const fonte = state.status === "ready" ? "hook:ready" : "offline";

            store.setState({ paginas, fonte });
            store.dispatch(Events.LEITOR_READY, { mangaId, numeroCap, chapterId, paginas, fonte });
            return paginas;
        } catch (error) {
            if (req.isStale()) return null;
            store.dispatch(Events.LEITOR_ERROR, { error: error.message });
            throw error;
        }
    },

    async saveForOffline(mangaData) {
        if (!mangaData?.id) return false;
        const ok = await OfflineStore.saveManga(mangaData);
        if (ok) store.dispatch(Events.OFFLINE_SAVED, { mangaId: mangaData.id });
        return ok;
    },

    reset() {
        pendingMangaId = null;
        _chapterLoader.reset();
        store.reset();
    }
};
