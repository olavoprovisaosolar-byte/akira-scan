/**
 * Cliente do catálogo AkiraScan — apenas requisições ao domínio local (/api/catalogo).
 * Capítulos: carregamento no navegador com fallback via proxy same-origin.
 */
const API = "/api/catalogo";

/** @type {string} uso interno do proxy servidor */
const ORIGEM_INTERNA = "https://toonlivre.net";

function apiUrl(caminho) {
    return `${API}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}

async function fetchJson(caminho) {
    const res = await fetch(apiUrl(caminho));
    let data;
    try {
        data = await res.json();
    } catch {
        throw new Error("Resposta inválida do catálogo.");
    }
    if (data.error) throw new Error("Conteúdo temporariamente indisponível.");
    if (!res.ok) throw new Error(`Erro ${res.status} ao carregar catálogo`);
    return data;
}

export function urlImagemProxy(url) {
    if (!url) return "";
    if (url.startsWith("/api/catalogo/")) return url;
    return `${API}/img?url=${encodeURIComponent(url)}`;
}

function mapearPaginas(urls) {
    return urls.map((url, index) => ({
        index,
        url: urlImagemProxy(url)
    }));
}

async function obterToken() {
    const res = await fetch(`${API}/token`);
    if (!res.ok) throw new Error("Catálogo indisponível");
    return res.json();
}

/**
 * Pedido direto no navegador do utilizador (IP real, pode contornar bloqueio do proxy).
 */
async function obterPaginasNoNavegador(mangaId, chapterId, numeroCap) {
    const token = await obterToken();
    const referer = `${ORIGEM_INTERNA}/${encodeURIComponent(mangaId)}/${encodeURIComponent(numeroCap)}`;
    const endpoint = `${ORIGEM_INTERNA}/api/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`;

    const res = await fetch(endpoint, {
        headers: {
            [token.header]: token.value,
            Referer: referer,
            Origin: ORIGEM_INTERNA,
            Accept: "application/json,*/*"
        }
    });

    const data = await res.json();
    if (data.error || !data.pages?.length) {
        throw new Error("Capítulo temporariamente indisponível.");
    }
    return mapearPaginas(data.pages);
}

async function obterPaginasViaProxy(mangaId, chapterId, numeroCap) {
    const params = new URLSearchParams({
        m: mangaId,
        n: String(numeroCap),
        ch: chapterId
    });
    const data = await fetchJson(`/capitulo?${params}`);
    if (!data.pages?.length) throw new Error("Capítulo sem páginas.");
    return mapearPaginas(data.pages);
}

export async function obterPaginasCapitulo(mangaId, chapterId, numeroCap) {
    try {
        const paginas = await obterPaginasNoNavegador(mangaId, chapterId, numeroCap);
        if (paginas.length >= 1) return paginas;
    } catch (e) {
        console.warn("Capítulo (navegador):", e.message);
    }

    return obterPaginasViaProxy(mangaId, chapterId, numeroCap);
}

export async function pesquisarMangasRemoto({ page = 1, limit = 24, q = "", sortBy = "popular", sortOrder = "desc" } = {}) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortOrder
    });
    if (q) params.set("q", q);

    const data = await fetchJson(`/api/mangas/search?${params}`);
    return {
        mangas: (data.mangas || []).map(normalizarMangaRemoto),
        hasNext: data.pagination?.hasNextPage ?? false
    };
}

export async function obterMangaRemoto(id) {
    const data = await fetchJson(`/api/manga-by-slug/${encodeURIComponent(id)}`);
    return normalizarMangaRemoto(data);
}

export async function catalogoRemotoDisponivel() {
    try {
        const res = await fetch(`${API}/token`, { method: "GET" });
        return res.ok;
    } catch {
        return false;
    }
}

function normalizarMangaRemoto(m) {
    const id = m.id || m.uploadSlug;
    return {
        id,
        titulo: m.title || m.titulo,
        sinopse: m.description || m.sinopse || "Sem sinopse disponível.",
        capa: m.coverUrl ? urlImagemProxy(m.coverUrl) : (m.capa || ""),
        generos: m.genres || m.generos || [],
        capitulos: (m.chapters || m.capitulos || []).map((c) => ({
            id: c.id,
            numero: c.number ?? c.numero,
            pageCount: c.pageCount ?? c.page_count ?? null
        })).sort((a, b) => Number(b.numero) - Number(a.numero))
    };
}
