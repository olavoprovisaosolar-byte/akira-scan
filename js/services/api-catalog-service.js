/**
 * Camada API — catálogo local + seed (`data/catalogo.json`).
 */
import { assetUrl, isStaticHost, cloudApiDisponivel } from "../site-config.js";
import {
    bibliotecaDisponivel,
    listarMangasBiblioteca,
    obterPaginasBiblioteca
} from "../catalogo-biblioteca.js";
import {
    mergeCatalogo,
    paginasDemo,
    todosGeneros,
    capsRecentes,
    ordenar,
    rankingSemanal
} from "../mangas-destaque.js";
import { numeroCapituloLabel, parseChapterNumber, isValidChapterPageSet, isRealChapterPageSet } from "./chapter-label.js";

export { numeroCapituloLabel, parseChapterNumber };

let cacheLista = null;
let cacheTs = 0;
const CACHE_MS = 60000;
const FETCH_TIMEOUT_MS = 45000;

let inflightLista = null;
let cacheCatalogoFull = null;
let inflightCatalogoFull = null;

async function carregarMangaDoCatalogoCompleto(mangaId) {
    if (!inflightCatalogoFull) {
        inflightCatalogoFull = (async () => {
            try {
                const res = await fetchWithTimeout(assetUrl("/data/catalogo.json"), 90000);
                if (!res.ok) return [];
                const data = await res.json();
                cacheCatalogoFull = data.mangas || [];
                return cacheCatalogoFull;
            } catch (e) {
                console.warn("[Catalogo] catalogo.json:", e.message);
                return [];
            } finally {
                inflightCatalogoFull = null;
            }
        })();
    }
    const mangas = cacheCatalogoFull || await inflightCatalogoFull;
    const raw = mangas.find((m) => m.id === mangaId);
    if (!raw) return null;
    try {
        return mergeCatalogo([], [raw])[0];
    } catch {
        return raw;
    }
}

function precisaCatalogoCompleto(manga) {
    if (!manga) return true;
    const total = manga.totalCapitulos ?? manga.capitulos?.length ?? 0;
    const atual = manga.capitulos?.length ?? 0;
    return total > atual;
}

function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function carregarCatalogoSeed() {
    const bust = `v=${Date.now().toString(36)}`;
    const urls = isStaticHost()
        ? [
            `${assetUrl("/data/catalogo-index.json")}?${bust}`,
            `${assetUrl("/data/catalogo.json")}?${bust}`
        ]
        : [
            `${assetUrl("/data/catalogo-index.json")}?${bust}`,
            `${assetUrl("/data/catalogo.json")}?${bust}`,
            `${assetUrl("/api/biblioteca")}?${bust}`
        ];

    for (const url of urls) {
        try {
            const timeout = url.includes("index") ? 20000 : url.includes("biblioteca") ? 15000 : 60000;
            const res = await fetchWithTimeout(url, timeout);
            if (!res.ok) continue;
            const data = await res.json();
            const lista = data.mangas || [];
            if (!lista.length) continue;
            try {
                return mergeCatalogo([], lista);
            } catch (mergeErr) {
                console.warn("[Catalogo] merge seed:", mergeErr.message);
                return lista;
            }
        } catch (e) {
            console.warn(`[Catalogo] seed ${url}:`, e.message);
        }
    }
    return [];
}

async function listaDaApi() {
    if (inflightLista) return inflightLista;

    inflightLista = (async () => {
        const seed = await carregarCatalogoSeed();
        if (seed.length) return seed;

        try {
            if (!isStaticHost() && await bibliotecaDisponivel()) {
                const lista = await listarMangasBiblioteca();
                if (lista.length) return lista;
            }
        } catch (e) {
            console.warn("[Catalogo] biblioteca API:", e.message);
        }

        return [];
    })();

    try {
        return await inflightLista;
    } finally {
        inflightLista = null;
    }
}

export async function obterCatalogoApi(force = false) {
    if (!force && cacheLista && Date.now() - cacheTs < CACHE_MS) {
        return cacheLista;
    }
    cacheLista = await listaDaApi();
    if (!cacheLista.length) {
        cacheLista = mergeCatalogo([]);
    }
    cacheTs = Date.now();
    return cacheLista;
}

async function enriquecerSePossivel(manga) {
    if (!manga) return manga;
    try {
        const { enriquecerMangaComRemoto } = await import("./manga-chapters-link.js");
        return await enriquecerMangaComRemoto(manga);
    } catch (e) {
        console.warn("[Catalogo] enriquecer remoto:", e.message);
        return manga;
    }
}

export async function obterMangaApi(mangaId) {
    if (!isStaticHost()) {
        try {
            const res = await fetchWithTimeout(`/api/manga/${encodeURIComponent(mangaId)}`, 15000);
            if (res.ok) {
                const data = await res.json();
                if (data.manga) return enriquecerSePossivel(data.manga);
            }
        } catch (e) {
            console.warn("[Catalogo] API manga:", e.message);
        }

        try {
            const res = await fetchWithTimeout(`/api/biblioteca/${encodeURIComponent(mangaId)}`, 15000);
            if (res.ok) {
                const data = await res.json();
                if (data.manga?.capitulos?.length) return enriquecerSePossivel(data.manga);
            }
        } catch (e) {
            console.warn("[Catalogo] biblioteca manga:", e.message);
        }
    }

    let manga = (await obterCatalogoApi()).find((m) => m.id === mangaId);
    if (manga && precisaCatalogoCompleto(manga)) {
        const completo = await carregarMangaDoCatalogoCompleto(mangaId);
        if (completo?.capitulos?.length) manga = completo;
    }
    if (!manga) {
        manga = await carregarMangaDoCatalogoCompleto(mangaId);
    }
    if (!manga) throw new Error("Mangá não encontrado.");
    return enriquecerSePossivel(manga);
}

export async function listarMangasApi(opts = {}) {
    const {
        pagina = 1,
        porPagina = 24,
        busca = "",
        genero = "",
        sort = "az",
        favoritos = null
    } = opts;

    let lista = ordenar(await obterCatalogoApi(), sort);
    const termo = busca.trim().toLowerCase();

    if (termo === "favoritos" && Array.isArray(favoritos)) {
        lista = lista.filter((m) => favoritos.includes(m.id));
    } else if (termo) {
        lista = lista.filter((m) => {
            const titulo = (m.titulo || "").toLowerCase();
            const alt = (m.alternativeTitle || m.tituloAlternativo || "").toLowerCase();
            const autor = (m.autor || "").toLowerCase();
            const id = (m.id || "").toLowerCase();
            return titulo.includes(termo)
                || alt.includes(termo)
                || autor.includes(termo)
                || id.includes(termo)
                || (m.generos || []).some((g) => String(g).toLowerCase().includes(termo));
        });
    }

    if (genero) {
        lista = lista.filter((m) =>
            (m.generos || []).some((g) => g.toLowerCase() === genero.toLowerCase())
        );
    }

    const inicio = (pagina - 1) * porPagina;
    const completo = await obterCatalogoApi();
    return {
        mangas: lista.slice(inicio, inicio + porPagina),
        hasNext: inicio + porPagina < lista.length,
        total: lista.length,
        generos: todosGeneros(completo)
    };
}

export async function obterPaginasLeituraApi(mangaId, numeroCap, chapterId = null) {
    const manga = await obterMangaApi(mangaId);

    let capId = chapterId;
    if (!capId) {
        capId = manga.capitulos?.find((c) => String(numeroCapituloLabel(c)) === String(numeroCap))?.id;
    }
    if (!capId) {
        capId = manga.capitulos?.find((c) => c.id === String(numeroCap))?.id;
    }
    if (!capId) throw new Error("Capítulo não encontrado.");

    if (!isStaticHost() && await bibliotecaDisponivel()) {
        try {
            const params = new URLSearchParams({ n: String(numeroCap) });
            const res = await fetch(
                `/api/biblioteca/${encodeURIComponent(mangaId)}/${encodeURIComponent(capId)}?${params}`
            );
            const data = await res.json();
            if (res.ok && !data.demo && isRealChapterPageSet(data.pages)) {
                return data.pages;
            }
        } catch (e) {
            console.warn("[Catalogo] Biblioteca capítulo:", e.message);
        }
    }

    try {
        const paginas = await obterPaginasBiblioteca(mangaId, capId);
        if (isRealChapterPageSet(paginas)) return paginas;
    } catch { /* retry acima */ }

    try {
        const { obterPaginasRemotas } = await import("./cloud-chapters-service.js");
        const paginasRemotas = await obterPaginasRemotas(mangaId, capId);
        if (isRealChapterPageSet(paginasRemotas)) return paginasRemotas;
    } catch (e) {
        console.warn("[Catalogo] capítulo remoto:", e.message);
    }

    if (isStaticHost()) {
        try {
            const { capRemotoInfo } = await import("./cloud-chapters-service.js");
            const info = await capRemotoInfo(mangaId, capId);
            if (info?.done && !cloudApiDisponivel()) {
                throw new Error("Capítulo em sincronização. Configure a API de leitura.");
            }
        } catch (e) {
            if (e.message?.includes("sincronização") || e.message?.includes("Configure")) throw e;
        }
        return paginasDemo(mangaId, capId);
    }

    if (!isStaticHost() && (manga.origem === "toonlivre" || /^obra-/i.test(mangaId))) {
        try {
            const { obterPaginasCapitulo } = await import("../catalogo-remoto.js");
            const paginas = await obterPaginasCapitulo(mangaId, capId, numeroCap);
            if (isRealChapterPageSet(paginas)) return paginas;
        } catch (e) {
            console.warn("[Catalogo] ToonLivre (browser) capítulo:", e.message);
        }
    }

    const sourceMap = {
        toonlivre: "toonlivre",
        mangalivre: "mangalivre",
        mangalivreto: "mangalivreto",
        mangalivreblog: "mangalivreblog",
        bladetoons: "bladetoons"
    };
    const preferredSource = sourceMap[manga.origem] || "auto";

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        const params = new URLSearchParams({ n: String(numeroCap), source: preferredSource });
        const res = await fetch(
            `/api/v1/proxy/manga/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(capId)}?${params}`,
            { signal: controller.signal }
        );
        clearTimeout(timer);
        const data = await res.json();
        if (res.ok && isRealChapterPageSet(data.pages)) {
            return data.pages;
        }
        console.warn("[Catalogo] Proxy capítulo inválido ou vazio.");
    } catch (e) {
        console.warn("[Catalogo] Proxy capítulo:", e.message);
    }

    return paginasDemo(mangaId, capId);
}

export function invalidarCacheApi() {
    cacheLista = null;
    cacheTs = 0;
}

export { ordenar, capsRecentes, rankingSemanal, todosGeneros };
