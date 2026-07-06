/**
 * Config de hospedagem — detecta GitHub Pages vs servidor local.
 */
function detectBasePath() {
    if (typeof location === "undefined") return "/";
    if (!location.hostname.endsWith("github.io")) return "/";
    const seg = location.pathname.split("/").filter(Boolean)[0];
    if (!seg || seg.endsWith(".html")) return "/";
    return `/${seg}/`;
}

const onGitHub = typeof location !== "undefined" && location.hostname.endsWith("github.io");

export const SITE_CONFIG = {
    host: onGitHub ? "github-pages" : "local",
    basePath: detectBasePath(),
    staticOnly: onGitHub,
    cloudIndex: "data/cloud/chapters-index.json"
};

export function isStaticHost() {
    return SITE_CONFIG.staticOnly;
}

/** Prefixo para fetch de assets (respeita <base> e GitHub project pages). */
export function assetUrl(path) {
    const p = String(path || "").replace(/^\//, "");
    const base = SITE_CONFIG.basePath || "/";
    return base === "/" ? `/${p}` : `${base}${p}`;
}
