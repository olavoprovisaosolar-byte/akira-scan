/**
 * Config de hospedagem — detecta GitHub Pages vs servidor local.
 */
function detectBasePath() {
    if (typeof location === "undefined") return "/";
    if (!location.hostname.endsWith("github.io")) return "/";
    // user/org pages: akira-scan.github.io (sem subpasta)
    if (/^[\w-]+\.github\.io$/i.test(location.hostname)) return "/";
    const seg = location.pathname.split("/").filter(Boolean)[0];
    if (!seg || seg.endsWith(".html")) return "/";
    return `/${seg}/`;
}

const onGitHub = typeof location !== "undefined" && location.hostname.endsWith("github.io");

/** API de capítulos remotos (Netlify) — URLs estáveis, dlinks gerados no servidor. */
export const CLOUD_API_BASE = (typeof window !== "undefined" && window.__AKIRA_CLOUD_API__)
    || (typeof import.meta !== "undefined" && import.meta.env?.VITE_CLOUD_API)
    || "https://akira-scan.netlify.app";

export const SITE_CONFIG = {
    host: onGitHub ? "github-pages" : "local",
    basePath: detectBasePath(),
    staticOnly: onGitHub,
    cloudIndex: "data/cloud/chapters-index.json"
};

export function isStaticHost() {
    return SITE_CONFIG.staticOnly;
}

export function cloudApiDisponivel() {
    return Boolean(CLOUD_API_BASE);
}

export function cloudApiUrl(caminho, params = {}) {
    const base = (CLOUD_API_BASE || "").replace(/\/$/, "");
    if (!base) return caminho;
    const p = String(caminho || "").replace(/^\//, "");
    const url = new URL(`${base}/${p}`);
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
