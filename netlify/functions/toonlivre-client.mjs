/**
 * Cliente ToonLivre — API oficial (credenciais via variáveis de ambiente).
 * TOONLIVRE_BASE_URL, TOONLIVRE_TOKEN_HEADER, TOONLIVRE_TOKEN_VALUE
 */
const BASE = process.env.TOONLIVRE_BASE_URL || "https://toonlivre.net";
const DEFAULT_TOKEN = {
    header: process.env.TOONLIVRE_TOKEN_HEADER || "x-tly-sec",
    value: process.env.TOONLIVRE_TOKEN_VALUE || "web-z99"
};

const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept: "*/*, application/json",
    Origin: BASE
};

let cachedToken = null;

export function urlImagemProxy(url, apiPrefix = "/api/catalogo") {
    if (!url) return "";
    if (url.startsWith("/")) return url;
    return `${apiPrefix}/img?url=${encodeURIComponent(url)}`;
}

export function normalizarMangaRemoto(m, apiPrefix = "/api/catalogo") {
    const id = m.id || m.uploadSlug || m.slug;
    const capaRemota = m.coverUrl || m.cover || m.capa || "";
    const capa = capaRemota ? urlImagemProxy(capaRemota, apiPrefix) : "";
    const caps = (m.chapters || m.capitulos || [])
        .map((c) => ({
            id: c.id,
            numero: Number(c.number ?? c.numero ?? c.chapterNumber) || 0,
            titulo: c.title || c.titulo || null,
            paginas: c.pageCount ?? c.page_count ?? c.paginas ?? 0,
            publicadoEm: c.publishedAt || c.createdAt || c.updatedAt || new Date().toISOString(),
            novo: c.isNew || false
        }))
        .filter((c) => c.numero > 0)
        .sort((a, b) => Number(b.numero) - Number(a.numero));

    return {
        id,
        titulo: m.title || m.titulo || id,
        sinopse: m.description || m.sinopse || "",
        autor: m.author || m.autor || "",
        artista: m.artist || m.artista || "",
        generos: m.genres || m.generos || [],
        status: m.status === "completed" ? "Completo" : (m.status || "Em lançamento"),
        capa,
        banner: capa,
        popularidade: m.views || m.popularity || m.rating || 50,
        capitulos: caps,
        atualizadoEm: caps[0]?.publicadoEm || new Date().toISOString(),
        origem: "toonlivre",
        toonlivreId: id
    };
}

async function scrapeTokenFromHtml(html) {
    const assetPath = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
    if (!assetPath) return null;
    const jsRes = await fetch(`${BASE}${assetPath}`, {
        headers: { ...BROWSER_HEADERS, Referer: `${BASE}/` }
    });
    if (!jsRes.ok) return null;
    const js = await jsRes.text();
    const pair = js.match(/"(x-t[a-z0-9-]+)"\s*[,:]\s*"(web-[a-z0-9]+)"/);
    if (pair) return { header: pair[1], value: pair[2] };
    return null;
}

export async function obterToken(force = false) {
    if (process.env.TOONLIVRE_TOKEN_VALUE && process.env.TOONLIVRE_TOKEN_HEADER) {
        return {
            header: process.env.TOONLIVRE_TOKEN_HEADER,
            value: process.env.TOONLIVRE_TOKEN_VALUE
        };
    }
    if (!force && cachedToken) return cachedToken;
    try {
        const htmlRes = await fetch(`${BASE}/`, { headers: BROWSER_HEADERS });
        if (htmlRes.ok) {
            const fromHtml = await scrapeTokenFromHtml(await htmlRes.text());
            if (fromHtml) {
                cachedToken = fromHtml;
                return cachedToken;
            }
        }
    } catch { /* fallback */ }
    cachedToken = DEFAULT_TOKEN;
    return cachedToken;
}

export async function fetchToonLivre(pathAndQuery, opts = {}) {
    const token = await obterToken(opts.forceFresh);
    const headers = {
        ...BROWSER_HEADERS,
        Referer: opts.referer || `${BASE}/`,
        [token.header]: token.value,
        ...(opts.cookies ? { Cookie: opts.cookies } : {})
    };
    if (process.env.TOONLIVRE_API_KEY) {
        headers.Authorization = `Bearer ${process.env.TOONLIVRE_API_KEY}`;
    }

    const res = await fetch(`${BASE}${pathAndQuery}`, { headers, redirect: "manual" });
    let finalRes = res;

    if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (loc) {
            const target = new URL(loc, BASE);
            const baseHost = new URL(BASE).hostname;
            if (target.hostname !== baseHost) {
                throw new Error(`Redirect bloqueado para ${target.hostname}`);
            }
            finalRes = await fetch(target.href, { headers, redirect: "follow" });
        }
    }

    const text = await finalRes.text();

    if ((finalRes.status === 403 || text.trimStart().startsWith("<")) && opts.retry !== false) {
        cachedToken = await obterToken(true);
        return fetchToonLivre(pathAndQuery, { ...opts, retry: false });
    }

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Resposta inválida ToonLivre (${finalRes.status})`);
    }
    if (data.error) throw new Error(data.error);
    return data;
}

export async function pesquisarMangas({ page = 1, limit = 48, q = "", sortBy = "popular" } = {}) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortOrder: "desc"
    });
    if (q) params.set("q", q);
    return fetchToonLivre(`/api/mangas/search?${params}`);
}

export async function obterMangaPorSlug(slug) {
    return fetchToonLivre(`/api/manga-by-slug/${encodeURIComponent(slug)}`);
}

export async function obterPaginasCapitulo(mangaId, chapterId, numeroCap) {
    const referer = `${BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(numeroCap)}`;
    const data = await fetchToonLivre(
        `/api/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`,
        { referer, forceFresh: true }
    );
    return data.pages || [];
}

export { BASE as TOONLIVRE_BASE };
