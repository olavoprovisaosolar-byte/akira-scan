/**
 * Regras de URL de página (frontend) — espelho de scripts/lib/page-url-rules.mjs.
 * Manter sincronizado ao alterar a regra de legibilidade.
 */
export function isDurablePageUrl(url) {
    const u = String(url || "");
    if (!u || u.includes("litter.catbox.moe")) return false;
    return u.includes("telegra.ph")
        || u.includes("iili.io")
        || u.includes("freeimage.host")
        || u.includes("i.ibb.co")
        || u.includes("ibb.co")
        || u.includes("files.catbox.moe")
        || u.includes("pixeldrain.com");
}

export function isWorkingProxyPageUrl(url) {
    const u = String(url || "");
    return u.includes("/api/gh-cdn/")
        || u.includes("/api/cloud/page");
}

export function isServablePageUrl(url) {
    const u = String(url || "");
    if (!u || u.includes("litter.catbox.moe")) return false;
    if (u.includes("/data/cloud/pages/")) return false;
    if (u.includes("/api/discord-img")) return false;
    return isDurablePageUrl(u) || isWorkingProxyPageUrl(u);
}

export function isStructurallyValidPageUrl(url) {
    const u = String(url || "");
    if (!u) return false;
    if (u.includes("litter.catbox.moe")) return false;
    if (u.includes("/data/cloud/pages/")) return false;
    return isDurablePageUrl(u)
        || isWorkingProxyPageUrl(u)
        || u.includes("/api/discord-img")
        || /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(u);
}
