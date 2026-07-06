/**
 * cover-utils — capa por mangá, cadeia de fallback CDN/backup/local.
 */
import { assetUrl } from "../site-config.js";

const PLACEHOLDER_RE = /placehold\.co\/.*text=\?|^$|placeholder|no-?image|default-cover/i;

/** Converte caminhos legados (/backup/…) para URLs válidas no GitHub Pages. */
export function normalizeAssetPath(url) {
    if (!url || typeof url !== "string") return url;
    const u = url.trim();
    if (u.startsWith("http") || u.startsWith("//")) return u;
    if (u.startsWith("/backup/mangas/")) {
        return assetUrl(`data/toonlivre-backup/mangas/${u.slice("/backup/mangas/".length)}`);
    }
    if (u.startsWith("/data/")) return assetUrl(u.slice(1));
    if (u.startsWith("data/") || u.startsWith("backup/") || u.startsWith("biblioteca/")) {
        return assetUrl(u);
    }
    if (u.startsWith("/")) return assetUrl(u.slice(1));
    return u;
}

export function isValidCoverUrl(url) {
    if (!url || typeof url !== "string") return false;
    const u = url.trim();
    if (!u || PLACEHOLDER_RE.test(u)) return false;
    if (u.startsWith("http") ||
        u.startsWith("/api/") ||
        u.includes("/biblioteca/") ||
        u.includes("/backup/") ||
        u.includes("/data/toonlivre-backup/") ||
        u.includes("data/toonlivre-backup/")) return true;
    return false;
}

/** Escolhe a melhor capa disponível para um mangá (nunca de outro ID). */
export function resolveMangaCover(manga) {
    if (!manga) return "";
    const candidates = [manga.capa, manga.banner, manga.coverUrl, manga.bannerUrl]
        .map(normalizeAssetPath)
        .filter(Boolean);
    for (const c of candidates) {
        if (isValidCoverUrl(c)) return c;
    }
    return candidates[0] || "";
}

/** URLs alternativas (backup local, extensões, placeholder). */
export function buildCoverFallbacks(manga) {
    const id = manga?.id || "";
    const titulo = manga?.titulo || "";
    const out = [];
    const add = (url) => {
        if (!url || out.includes(url)) return;
        if (url.startsWith("https://placehold.co")) {
            out.push(url);
            return;
        }
        if (isValidCoverUrl(url)) out.push(url);
    };

    add(resolveMangaCover(manga));

    if (id) {
        for (const ext of ["webp", "jpg", "jpeg", "png"]) {
            add(assetUrl(`backup/mangas/${id}/cover.${ext}`));
            add(assetUrl(`data/toonlivre-backup/mangas/${id}/cover.${ext}`));
            add(assetUrl(`biblioteca/${id}/capa.${ext}`));
            add(assetUrl(`biblioteca/${id}/cover.${ext}`));
        }
    }

    out.push(coverPlaceholder(id, titulo));
    return out;
}

/** Placeholder único por mangá (primeira letra do título). */
export function coverPlaceholder(mangaId, titulo = "") {
    const label = (titulo || mangaId || "?").trim().charAt(0).toUpperCase() || "?";
    return `https://placehold.co/300x420/141419/A855F7?text=${encodeURIComponent(label)}`;
}

/** Banner hero — mesma cadeia, proporção wide. */
export function buildBannerFallbacks(manga) {
    const id = manga?.id || "";
    const titulo = manga?.titulo || "";
    const primary = manga?.banner || resolveMangaCover(manga);
    const out = [];
    const add = (url) => {
        if (!url || out.includes(url)) return;
        if (isValidCoverUrl(url) || url.startsWith("https://placehold.co")) out.push(url);
    };

    add(primary);
    const caps = buildCoverFallbacks(manga);
    for (const u of caps) {
        if (!u.includes("placehold.co/300x420")) add(u);
    }
    const label = (titulo || id || "?").trim().slice(0, 12);
    out.push(`https://placehold.co/1200x480/141419/A855F7?text=${encodeURIComponent(label)}`);
    return out;
}

let fallbackHandlerInstalled = false;

/** Aplica cadeia de fallback num elemento img existente. */
export function applyCoverToImg(img, manga, { banner = false } = {}) {
    if (!img || !manga) return;
    installCoverFallbackHandler();
    const fallbacks = banner ? buildBannerFallbacks(manga) : buildCoverFallbacks(manga);
    const primary = fallbacks[0] || coverPlaceholder(manga.id, manga.titulo);
    img.dataset.fallbacks = JSON.stringify(fallbacks.slice(1));
    if (manga.id) img.dataset.mangaId = manga.id;
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.classList.remove("is-loaded");
    img.onerror = () => window.__akiraCoverFallback?.(img);
    img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
    img.src = primary;
}

/** Handler global para onerror encadeado (img[data-fallbacks]). */
export function installCoverFallbackHandler() {
    if (fallbackHandlerInstalled || typeof window === "undefined") return;
    fallbackHandlerInstalled = true;

    window.__akiraCoverFallback = (img) => {
        if (!img) return;
        let list = [];
        try {
            list = JSON.parse(img.dataset.fallbacks || "[]");
        } catch {
            list = [];
        }
        if (!list.length) {
            img.classList.add("is-loaded");
            return;
        }
        const next = list.shift();
        img.dataset.fallbacks = JSON.stringify(list);
        img.classList.remove("is-loaded");
        img.src = next;
    };
}

/** Atributos HTML para img com fallback automático. */
export function coverImgTagAttrs(manga, { loading = "lazy", className = "" } = {}) {
    installCoverFallbackHandler();
    const fallbacks = buildCoverFallbacks(manga);
    const src = fallbacks[0] || coverPlaceholder(manga?.id, manga?.titulo);
    const rest = fallbacks.slice(1);
    const cls = className ? ` class="${className}"` : "";
    const id = manga?.id || "";
    const titulo = manga?.titulo || "";

    return {
        src,
        rest,
        html: `src="${escapeAttr(src)}" alt="${escapeAttr(titulo)}"${cls}
                 data-manga-id="${escapeAttr(id)}"
                 data-fallbacks="${escapeAttr(JSON.stringify(rest))}"
                 loading="${loading}" decoding="async" referrerpolicy="no-referrer"
                 onload="this.classList.add('is-loaded')"
                 onerror="window.__akiraCoverFallback&&window.__akiraCoverFallback(this)"`
    };
}

export function bannerImgTagAttrs(manga, { loading = "lazy", className = "hero-slide-bg" } = {}) {
    installCoverFallbackHandler();
    const fallbacks = buildBannerFallbacks(manga);
    const src = fallbacks[0];
    const rest = fallbacks.slice(1);

    return `class="${className}" src="${escapeAttr(src)}" alt=""
            data-fallbacks="${escapeAttr(JSON.stringify(rest))}"
            loading="${loading}" decoding="async" referrerpolicy="no-referrer"
            onload="this.classList.add('is-loaded')"
            onerror="window.__akiraCoverFallback&&window.__akiraCoverFallback(this)"`;
}

function escapeAttr(v = "") {
    return String(v)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

/** onerror handler legado — substitui por placeholder do próprio mangá. */
export function coverOnErrorAttr(mangaId, titulo = "") {
    const ph = coverPlaceholder(mangaId, titulo);
    return `this.onerror=null;this.src='${ph.replace(/'/g, "%27")}'`;
}
