const BASE = "https://toonlivre.net";

const DEFAULT_TOKEN = { header: "x-tly-sec", value: "web-z99" };
const ASSET_REGEX = /\/assets\/index-[\w-]+\.js/;
const PAIR_REGEX = /"(x-t[a-z0-9-]+)"\s*[,:]\s*"(web-[a-z0-9]+)"/;
const VALUE_REGEX = /"(web-[a-z0-9]+)"/g;

let cachedToken = null;

const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "*/*, application/json",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Origin": BASE
};

function corsHeaders(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        ...extra
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders({ "Content-Type": "application/json" })
    });
}

function extrairCookies(response) {
    try {
        if (typeof response.headers.getSetCookie === "function") {
            return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
        }
        const raw = response.headers.get("set-cookie");
        return raw ? raw.split(",").map((c) => c.split(";")[0].trim()).join("; ") : "";
    } catch {
        return "";
    }
}

async function scrapeTokenFromHtml(html) {
    const assetPath = html.match(ASSET_REGEX)?.[0];
    if (!assetPath) return null;

    const jsRes = await fetch(`${BASE}${assetPath}`, {
        headers: { ...BROWSER_HEADERS, Referer: `${BASE}/` },
        redirect: "manual"
    });
    if (jsRes.status >= 300) return null;

    const js = await jsRes.text();
    const pair = js.match(PAIR_REGEX);
    if (pair) return { header: pair[1], value: pair[2] };

    const values = [...js.matchAll(VALUE_REGEX)].map((m) => m[1]);
    const unique = [...new Set(values)];
    if (unique.length === 1) {
        return { header: DEFAULT_TOKEN.header, value: unique[0] };
    }
    return null;
}

async function scrapeToken(refererHtml = "") {
    try {
        if (refererHtml) {
            const fromPage = await scrapeTokenFromHtml(refererHtml);
            if (fromPage) return fromPage;
        }

        const htmlRes = await fetch(`${BASE}/index.html`, {
            headers: { ...BROWSER_HEADERS, Referer: `${BASE}/` },
            redirect: "manual"
        });
        if (htmlRes.status < 300) {
            const fromIndex = await scrapeTokenFromHtml(await htmlRes.text());
            if (fromIndex) return fromIndex;
        }
    } catch (e) {
        console.error("Token scrape failed:", e.message);
    }
    return DEFAULT_TOKEN;
}

async function getToken(forceFresh = false, refererHtml = "") {
    if (forceFresh || !cachedToken) {
        cachedToken = await scrapeToken(refererHtml);
    }
    return cachedToken;
}

function jsonTemErro(text) {
    try {
        const data = JSON.parse(text);
        return data?.error ? data.error : null;
    } catch {
        return null;
    }
}

const DOMINIOS_OK = /toonlivre\.net|tlycdn|cloudfront\.net|r2\.cloudflarestorage|supabase|storage\.googleapis/i;
const DOMINIOS_NOK = /amung\.us|google|facebook|analytics|widget|pixel|favicon|gravatar/i;

function filtrarPaginas(urls) {
    const vistos = new Set();
    const limpo = [];
    for (const u of urls) {
        if (typeof u !== "string" || !u.startsWith("http") || vistos.has(u)) continue;
        if (DOMINIOS_NOK.test(u) || /\.gif(\?|$)/i.test(u)) continue;
        if (DOMINIOS_OK.test(u) || /\.(webp|jpg|jpeg|png)(\?|$)/i.test(u)) {
            vistos.add(u);
            limpo.push(u);
        }
    }
    return limpo;
}

function extrairPaginasDeTexto(text) {
    const match = text.match(/"pages"\s*:\s*(\[[\s\S]*?\])/);
    if (match) {
        try {
            const parsed = JSON.parse(match[1].replace(/\\"/g, '"'));
            const filtrado = filtrarPaginas(parsed);
            if (filtrado.length >= 2) return filtrado;
        } catch { /* continua */ }
    }
    return filtrarPaginas([...text.matchAll(/https?:\/\/[^"'\\\s]+\.(?:webp|jpg|jpeg|png)(?:\?[^"'\\\s]*)?/gi)].map((m) => m[0]));
}

async function fetchOrigem(pathAndQuery, options = {}) {
    const token = await getToken(options.forceFresh);
    const referer = options.referer || `${BASE}/`;
    const headers = {
        ...BROWSER_HEADERS,
        Referer: referer,
        [token.header]: token.value
    };
    if (options.cookies) headers.Cookie = options.cookies;

    const res = await fetch(`${BASE}${pathAndQuery}`, { headers, redirect: "follow" });
    const text = await res.text();
    const isHtml = text.trimStart().startsWith("<") && !text.trimStart().startsWith("<!");
    const erroJson = jsonTemErro(text);

    if ((res.status === 403 || (isHtml && pathAndQuery.includes("/api/")) || erroJson) && options.retry !== false) {
        cachedToken = await scrapeToken();
        return fetchOrigem(pathAndQuery, { ...options, retry: false, forceFresh: true });
    }

    return { res, text, isHtml, erroJson };
}

async function obterSessaoCapitulo(mangaId, capNum, clientHeaders = {}) {
    const referer = `${BASE}/${mangaId}/${capNum}`;
    const token = await getToken(true);
    const res = await fetch(referer, {
        headers: {
            ...BROWSER_HEADERS,
            ...clientHeaders,
            Referer: `${BASE}/`,
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
            [token.header]: token.value
        },
        redirect: "follow"
    });
    return { referer: res.url || referer, cookies: extrairCookies(res), html: await res.text() };
}

async function obterPaginasCapituloServidor(mangaId, chapterId, numeroCap, clientHeaders = {}) {
    const sessao = await obterSessaoCapitulo(mangaId, numeroCap, clientHeaders);
    const token = await getToken(true, sessao.html);
    const apiPath = `/api/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`;
    const headers = {
        ...BROWSER_HEADERS,
        ...clientHeaders,
        Referer: sessao.referer,
        [token.header]: token.value
    };
    if (sessao.cookies) headers.Cookie = sessao.cookies;

    const res = await fetch(`${BASE}${apiPath}`, { headers, redirect: "follow" });
    const text = await res.text();
    const erroJson = jsonTemErro(text);

    if (!erroJson) {
        try {
            const data = JSON.parse(text);
            if (data.pages?.length >= 1) return data.pages;
        } catch { /* continua */ }
    }

    const doHtml = extrairPaginasDeTexto(sessao.html);
    if (doHtml.length >= 1) return doHtml;

    throw new Error(erroJson || "Capítulo indisponível.");
}

export { obterPaginasCapituloServidor };

function headersDoCliente(req) {
    const h = {};
    const ua = req.headers.get("user-agent");
    if (ua) h["User-Agent"] = ua;
    const lang = req.headers.get("accept-language");
    if (lang) h["Accept-Language"] = lang;
    return h;
}

async function proxyImagem(imageUrl) {
    const token = await getToken();
    const res = await fetch(imageUrl, {
        headers: {
            ...BROWSER_HEADERS,
            Referer: `${BASE}/`,
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            [token.header]: token.value
        },
        redirect: "follow"
    });

    if (!res.ok) {
        return new Response("Image fetch failed", { status: res.status, headers: corsHeaders() });
    }

    const buffer = await res.arrayBuffer();
    return new Response(buffer, {
        status: res.status,
        headers: corsHeaders({
            "Content-Type": res.headers.get("content-type") || "image/webp",
            "Cache-Control": "public, max-age=3600"
        })
    });
}

export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (req.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/^\/api\/catalogo/, "") || "/";

    try {
        if (pathname === "/token") {
            const token = await getToken(true);
            return jsonResponse({ header: token.header, value: token.value });
        }

        if (pathname === "/paginas" || pathname === "/capitulo") {
            const mangaId = url.searchParams.get("m");
            const chapterId = url.searchParams.get("ch");
            const numeroCap = url.searchParams.get("n");
            if (!mangaId || !chapterId || !numeroCap) {
                return jsonResponse({ error: "Parâmetros m, n, ch obrigatórios." }, 400);
            }
            const clientH = headersDoCliente(req);
            const pages = await obterPaginasCapituloServidor(mangaId, chapterId, numeroCap, clientH);
            return jsonResponse({ pages });
        }

        if (pathname.startsWith("/img")) {
            const imageUrl = url.searchParams.get("url");
            if (!imageUrl) return new Response("Missing url", { status: 400, headers: corsHeaders() });
            return proxyImagem(decodeURIComponent(imageUrl));
        }

        const refManga = url.searchParams.get("refManga");
        const refCap = url.searchParams.get("refCap");
        const isCapitulo = pathname.includes("/chapters/");

        let fetchOptions = { forceFresh: isCapitulo };
        if (isCapitulo && refManga && refCap) {
            const sessao = await obterSessaoCapitulo(refManga, refCap, headersDoCliente(req));
            fetchOptions.referer = sessao.referer;
            fetchOptions.cookies = sessao.cookies;
        }

        const pathAndQuery = pathname + url.search;
        const { res, text, isHtml, erroJson } = await fetchOrigem(pathAndQuery, fetchOptions);

        if (isHtml && pathAndQuery.includes("/api/")) {
            return jsonResponse({ error: "Catálogo temporariamente indisponível." }, 502);
        }
        if (erroJson) {
            return jsonResponse({ error: erroJson }, 403);
        }

        return new Response(text, {
            status: res.status,
            headers: corsHeaders({ "Content-Type": res.headers.get("content-type") || "application/json" })
        });
    } catch (error) {
        return jsonResponse({ error: error.message }, 500);
    }
};

export const config = { path: "/api/catalogo/*" };
