/**
 * Config de hospedagem — GitHub Pages, Cloudflare Pages ou servidor local.
 */
function detectBasePath() {
    if (typeof location === "undefined") return "/";
    if (!location.hostname.endsWith("github.io")) return "/";
    // Org/user pages na raiz: akira-scan.github.io (sem subpasta)
    if (/^akira-scan\.github\.io$/i.test(location.hostname)) return "/";
    if (/^[\w-]+\.github\.io$/i.test(location.hostname)) {
        const seg = location.pathname.split("/").filter(Boolean)[0];
        // project pages: usuario.github.io/akira-scan/
        if (seg && !seg.endsWith(".html")) return `/${seg}/`;
        return "/";
    }
    return "/";
}

function isCloudflarePages() {
    if (typeof window !== "undefined" && window.__AKIRA_HOST__ === "cloudflare-pages") return true;
    if (typeof location === "undefined") return false;
    return /\.pages\.dev$/i.test(location.hostname);
}

function isStaticHostRuntime() {
    if (typeof location === "undefined") return false;
    return location.hostname.endsWith("github.io") || isCloudflarePages();
}

const onGitHub = typeof location !== "undefined" && location.hostname.endsWith("github.io");
const onCloudflare = isCloudflarePages();

const DEFAULT_NETLIFY_API = "https://akira-scan.netlify.app";

/** API de utilizadores (Netlify Blobs) — permanece no Netlify até migração para KV/D1. */
export const USER_API_BASE = (typeof window !== "undefined" && window.__AKIRA_USER_API__)
    || (onCloudflare ? DEFAULT_NETLIFY_API : "");

export const SITE_CONFIG = {
    host: onCloudflare ? "cloudflare-pages" : (onGitHub ? "github-pages" : "local"),
    basePath: detectBasePath(),
    staticOnly: isStaticHostRuntime(),
    cloudIndex: "data/cloud/chapters-index.json"
};

export function isStaticHost() {
    return SITE_CONFIG.staticOnly;
}

export function cloudApiDisponivel() {
    if (typeof location === "undefined") return false;
    return isCloudflarePages();
}

export function cloudApiUrl(caminho, params = {}) {
    const p = String(caminho || "").replace(/^\//, "");
    let base = "";
    if (cloudApiDisponivel() && typeof location !== "undefined") {
        base = location.origin.replace(/\/$/, "");
    } else if (USER_API_BASE) {
        base = USER_API_BASE.replace(/\/$/, "");
    }
    const url = base
        ? new URL(`${base}/${p}`)
        : new URL(`/${p}`, typeof location !== "undefined" ? location.origin : "http://localhost");
    for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
    return url.toString();
}

/** Prefixo para fetch de assets (respeita <base> e GitHub project pages). */
export function assetUrl(path) {
    const p = String(path || "").replace(/^\//, "");
    const base = SITE_CONFIG.basePath || "/";
    return base === "/" ? `/${p}` : `${base}${p}`;
}
