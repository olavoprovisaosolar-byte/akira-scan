/**
 * Blogger como CDN de páginas de capítulo (JSON feed público).
 *
 * Config (qualquer um):
 *   window.__AKIRA_BLOGGER__ = { blogId: "123...", host: "meublog.blogspot.com" }
 *   ?blog=meublog.blogspot.com&post=POST_ID
 *
 * Feed:
 *   https://HOST/feeds/posts/default/POST_ID?alt=json
 *   https://www.blogger.com/feeds/BLOG_ID/posts/default/POST_ID?alt=json
 */
import { SITE_CONFIG } from "../site-config.js";

const DEFAULT_CFG = {
    blogId: "",
    host: "" // ex: akirascan-cdn.blogspot.com
};

export function bloggerConfig() {
    const w = typeof window !== "undefined" ? window.__AKIRA_BLOGGER__ : null;
    return {
        blogId: String(w?.blogId || SITE_CONFIG.bloggerBlogId || DEFAULT_CFG.blogId || "").trim(),
        host: String(w?.host || SITE_CONFIG.bloggerHost || DEFAULT_CFG.host || "").trim()
            .replace(/^https?:\/\//i, "")
            .replace(/\/$/, "")
    };
}

/** Carrega data/blogger-config.json (uma vez) e mescla em window.__AKIRA_BLOGGER__. */
let _cfgLoaded = false;
export async function ensureBloggerConfigLoaded() {
    if (_cfgLoaded || typeof window === "undefined") return bloggerConfig();
    _cfgLoaded = true;
    try {
        const { assetUrl } = await import("../site-config.js");
        const res = await fetch(assetUrl("data/blogger-config.json") + `?v=${Date.now().toString(36)}`, {
            cache: "no-store"
        });
        if (res.ok) {
            const cfg = await res.json();
            window.__AKIRA_BLOGGER__ = {
                ...(window.__AKIRA_BLOGGER__ || {}),
                host: window.__AKIRA_BLOGGER__?.host || cfg.host || "",
                blogId: window.__AKIRA_BLOGGER__?.blogId || cfg.blogId || ""
            };
        }
    } catch { /* ignore */ }
    return bloggerConfig();
}

/** Extrai post ID de URL do Blogger ou devolve o próprio valor se já for ID. */
export function parseBloggerPostRef(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    if (/^\d{10,}$/.test(s)) return s;
    // https://xxx.blogspot.com/.../post.html  → busca post-ID no path raro;
    // melhor: ?post=ID explícito. Também aceita /feeds/.../ID
    const feed = s.match(/\/feeds\/posts\/default\/(\d+)/i);
    if (feed) return feed[1];
    const q = s.match(/[?&](?:post|postId|p)=(\d+)/i);
    if (q) return q[1];
    // URL clássica com data: .../2024/01/titulo.html — não dá para inferir ID
    return /^\d+$/.test(s) ? s : null;
}

/**
 * Força qualidade máxima nas URLs do Google/Blogger.
 * /s1600/ /w400-h600/ /s72-c/ → /s0/
 */
export function optimizeBloggerImageUrl(url) {
    let u = String(url || "").trim();
    if (!u) return "";
    // Protocol-relative
    if (u.startsWith("//")) u = `https:${u}`;
    // Googleusercontent / blogspot size tokens
    u = u.replace(/\/([sw]\d+(?:-[a-z0-9-]+)?)\//gi, "/s0/");
    u = u.replace(/=[sw]\d+(?:-[a-z0-9-]+)?$/i, "=s0");
    return u;
}

export function isBloggerImageUrl(url) {
    const u = String(url || "");
    return /googleusercontent\.com|bp\.blogspot\.com|blogger\.googleusercontent\.com/i.test(u);
}

/** Extrai src de todas as <img> do HTML do post. */
export function extractImageUrlsFromHtml(html) {
    const urls = [];
    const seen = new Set();
    const raw = String(html || "");

    // Prefer DOMParser no browser
    if (typeof DOMParser !== "undefined") {
        try {
            const doc = new DOMParser().parseFromString(raw, "text/html");
            doc.querySelectorAll("img").forEach((img) => {
                const src = img.getAttribute("src")
                    || img.getAttribute("data-src")
                    || img.getAttribute("data-original");
                pushUrl(src);
            });
            if (urls.length) return urls;
        } catch { /* fallback regex */ }
    }

    const re = /<img[^>]+(?:src|data-src|data-original)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(raw))) pushUrl(m[1]);
    return urls;

    function pushUrl(src) {
        const opt = optimizeBloggerImageUrl(src);
        if (!opt || seen.has(opt)) return;
        // Ignora ícones / 1px
        if (/\/s72-c\/|\/s35\/|spacer|pixel\.gif/i.test(opt)) return;
        seen.add(opt);
        urls.push(opt);
    }
}

function buildFeedUrls(postId, cfg, overrideHost) {
    const host = String(overrideHost || cfg.host || "").trim();
    const blogId = cfg.blogId;
    const urls = [];

    if (host) {
        urls.push(`https://${host}/feeds/posts/default/${postId}?alt=json`);
    }
    if (blogId) {
        urls.push(`https://www.blogger.com/feeds/${blogId}/posts/default/${postId}?alt=json`);
    }
    // Proxy Cloudflare Pages (evita CORS)
    if (typeof location !== "undefined") {
        const q = new URLSearchParams({ post: postId });
        if (host) q.set("blog", host);
        if (blogId) q.set("blogId", blogId);
        urls.push(`${location.origin}/api/blogger/post?${q}`);
    }
    return urls;
}

/**
 * @returns {Promise<{ title: string, postId: string, pages: Array<{index:number,url:string,origem:string}> }>}
 */
export async function fetchBloggerChapter(postRef, opts = {}) {
    await ensureBloggerConfigLoaded();
    const postId = parseBloggerPostRef(postRef);
    if (!postId) {
        throw new Error("ID do post Blogger inválido. Use ?post=NUMERO_DO_POST");
    }

    const cfg = bloggerConfig();
    const feedUrls = buildFeedUrls(postId, cfg, opts.blog || opts.host);
    if (!feedUrls.length) {
        throw new Error("Configure o Blogger: window.__AKIRA_BLOGGER__ = { host: 'seu-blog.blogspot.com' }");
    }

    let entry = null;
    let lastErr = null;

    for (const url of feedUrls) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "application/json, text/javascript, */*" },
                cache: "no-store",
                mode: "cors"
            });
            if (!res.ok) {
                lastErr = new Error(`HTTP ${res.status}`);
                continue;
            }
            const data = await res.json();
            // Proxy envelope
            if (data?.ok && data?.entry) {
                entry = data.entry;
                break;
            }
            entry = data?.entry || data;
            if (entry) break;
        } catch (e) {
            lastErr = e;
        }
    }

    if (!entry) {
        throw new Error(
            lastErr?.message
                ? `Erro ao carregar o capítulo. Tente novamente mais tarde. (${lastErr.message})`
                : "Erro ao carregar o capítulo. Tente novamente mais tarde."
        );
    }

    const title = entry.title?.$t || entry.title || `Capítulo ${postId}`;
    const html = entry.content?.$t || entry.content || entry.summary?.$t || "";
    const imageUrls = extractImageUrlsFromHtml(html);

    if (!imageUrls.length) {
        throw new Error("Este post não contém imagens de páginas.");
    }

    return {
        title: String(title),
        postId,
        pages: imageUrls.map((url, index) => ({
            index,
            url,
            origem: "blogger"
        }))
    };
}

/** Helper para montar link do leitor Akira → Blogger */
export function linkLeitorBlogger(postId, opts = {}) {
    const q = new URLSearchParams();
    q.set("post", String(postId));
    if (opts.blog) q.set("blog", opts.blog);
    if (opts.title) q.set("t", opts.title);
    return `leitor?${q}`;
}
