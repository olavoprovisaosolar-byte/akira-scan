/**
 * Data Service — camada unificada de dados.
 * Prioridade: API local/seed → Firestore (fallback, carregamento tardio).
 */
import {
    obterCatalogoApi,
    obterMangaApi,
    listarMangasApi,
    obterPaginasLeituraApi,
    invalidarCacheApi,
    numeroCapituloLabel,
    ordenar,
    capsRecentes,
    rankingSemanal,
    todosGeneros
} from "./api-catalog-service.js";
import { linkLeitor, linkManhwa, linkBiblioteca } from "../core/router.js";
import { mergeCatalogo } from "../mangas-destaque.js";

let firestoreModule = null;
let firestoreModuleFailed = false;

async function loadFirestoreModule() {
    if (firestoreModuleFailed) return null;
    if (firestoreModule) return firestoreModule;
    try {
        firestoreModule = await import("./firestore-service.js");
        return firestoreModule;
    } catch (error) {
        firestoreModuleFailed = true;
        console.warn("Firestore module:", error.message);
        return null;
    }
}

let cacheFonte = null;
let cacheCatalogo = null;
let cacheTs = 0;
const CACHE_MS = 45000;
const FIRESTORE_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label = "operação") {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${label} expirou (${ms}ms)`)), ms);
        })
    ]);
}

async function resolverCatalogo(force = false) {
    if (!force && cacheCatalogo && Date.now() - cacheTs < CACHE_MS) {
        return { mangas: cacheCatalogo, fonte: cacheFonte };
    }

    try {
        const mangas = await obterCatalogoApi(force);
        if (mangas.length) {
            cacheCatalogo = mangas;
            cacheFonte = "api";
            cacheTs = Date.now();
            return { mangas, fonte: "api" };
        }
    } catch (error) {
        console.warn("DataService API:", error.message);
    }

    const fs = await loadFirestoreModule();
    if (fs?.firestoreDisponivel?.()) {
        try {
            const count = await withTimeout(
                fs.contarMangasFirestore(),
                FIRESTORE_TIMEOUT_MS,
                "Firestore"
            );
            if (count > 0) {
                const mangas = await withTimeout(
                    fs.listarMangasFirestore(),
                    FIRESTORE_TIMEOUT_MS,
                    "Firestore listagem"
                );
                if (mangas.length) {
                    cacheCatalogo = mangas;
                    cacheFonte = "firestore";
                    cacheTs = Date.now();
                    return { mangas, fonte: "firestore" };
                }
            }
        } catch (error) {
            console.warn("DataService Firestore:", error.message);
        }
    }

    const fallback = fallbackCatalogo();
    if (fallback.length) {
        cacheCatalogo = fallback;
        cacheFonte = "fallback";
        cacheTs = Date.now();
        return { mangas: fallback, fonte: "fallback" };
    }

    throw new Error("Catálogo indisponível.");
}

function fallbackCatalogo() {
    return mergeCatalogo([]);
}

export async function obterCatalogoCompleto(force = false) {
    try {
        const { mangas } = await resolverCatalogo(force);
        return mangas;
    } catch {
        return fallbackCatalogo();
    }
}

export async function obterFonteDados() {
    const { fonte } = await resolverCatalogo();
    return fonte;
}

export async function obterManga(mangaId) {
    if (!mangaId) throw new Error("ID do mangá ausente.");

    try {
        return await obterMangaApi(mangaId);
    } catch (apiErr) {
        console.warn("DataService API manga:", apiErr.message);
    }

    const fs = await loadFirestoreModule();
    if (fs?.firestoreDisponivel?.()) {
        try {
            const doc = await withTimeout(
                fs.obterMangaFirestore(mangaId),
                FIRESTORE_TIMEOUT_MS,
                "Firestore manga"
            );
            if (doc) return doc;
        } catch (error) {
            console.warn("Firestore manga:", error.message);
        }
    }

    throw new Error("Mangá não encontrado.");
}

export async function listarMangas(opts = {}) {
    const { mangas } = await resolverCatalogo();
    const {
        pagina = 1,
        porPagina = 24,
        busca = "",
        genero = "",
        sort = "az",
        favoritos = null
    } = opts;

    let lista = ordenar(mangas, sort);
    const termo = busca.trim().toLowerCase();

    if (termo === "favoritos" && Array.isArray(favoritos)) {
        lista = lista.filter((m) => favoritos.includes(m.id));
    } else if (termo) {
        lista = lista.filter((m) =>
            m.titulo.toLowerCase().includes(termo) ||
            (m.autor || "").toLowerCase().includes(termo) ||
            (m.generos || []).some((g) => g.toLowerCase().includes(termo))
        );
    }

    if (genero) {
        lista = lista.filter((m) =>
            (m.generos || []).some((g) => g.toLowerCase() === genero.toLowerCase())
        );
    }

    const inicio = (pagina - 1) * porPagina;
    return {
        mangas: lista.slice(inicio, inicio + porPagina),
        hasNext: inicio + porPagina < lista.length,
        total: lista.length,
        generos: todosGeneros(mangas)
    };
}

export async function obterPopulares(limite = 8) {
    return ordenar(await obterCatalogoCompleto(), "popular").slice(0, limite);
}

export async function obterRankingSemanal(limite = 10) {
    return rankingSemanal(await obterCatalogoCompleto(), limite);
}

export async function obterCapsRecentes(limite = 10) {
    return capsRecentes(await obterCatalogoCompleto(), limite);
}

export async function obterSugestoesBusca(termo, limite = 8) {
    const t = termo.trim().toLowerCase();
    if (!t) return [];
    return (await obterCatalogoCompleto())
        .filter((m) =>
            m.titulo.toLowerCase().includes(t) ||
            (m.autor || "").toLowerCase().includes(t)
        )
        .slice(0, limite);
}

export async function obterPaginasLeitura(mangaId, numeroCap, chapterId = null) {
    return obterPaginasLeituraApi(mangaId, numeroCap, chapterId);
}

export async function obterCapaManga(mangaId) {
    try {
        return (await obterManga(mangaId)).capa;
    } catch {
        return "";
    }
}

export function invalidarCacheCatalogo() {
    cacheCatalogo = null;
    cacheFonte = null;
    cacheTs = 0;
    invalidarCacheApi();
}

export {
    linkLeitor,
    linkManhwa,
    linkBiblioteca,
    numeroCapituloLabel,
    ordenar
};

export function linkContinuar(mangaId, info) {
    return linkLeitor(mangaId, info.capitulo_atual || info.numeroCap || 1, info.chapterId);
}
