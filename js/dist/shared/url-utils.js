/** Resolve URL relativa contra uma base (evita `https://hostpath` sem barra). */
export function resolveAbsoluteUrl(base, path) {
    const p = (path || "").trim();
    if (!p)
        return "";
    if (p.startsWith("http://") || p.startsWith("https://"))
        return p;
    if (p.startsWith("//"))
        return `https:${p}`;
    const origin = base.replace(/\/+$/, "");
    return p.startsWith("/") ? `${origin}${p}` : `${origin}/${p}`;
}
/** Detecta URLs de capítulo inválidas (capa, link quebrado, thumbnail). */
export function isValidChapterImageUrl(url) {
    if (!url || typeof url !== "string")
        return false;
    const u = url.toLowerCase();
    if (u.includes("netassets"))
        return false;
    if (/logo|avatar|banner|icon|favicon|placeholder|placehold\.co/i.test(u))
        return false;
    if (/\/covers?\//i.test(u) && !/\/uploads\/.*chapter/i.test(u))
        return false;
    if (/\d{2,3}x\d{2,3}\.(webp|jpg|png)/i.test(u))
        return false;
    return /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(u) || u.includes("/uploads/");
}
export function validateChapterPages(pages) {
    if (!Array.isArray(pages) || pages.length < 2)
        return false;
    const urls = pages.map((p) => p.url || "").filter(Boolean);
    if (urls.length < 2)
        return false;
    const valid = urls.filter(isValidChapterImageUrl);
    return valid.length >= Math.min(2, urls.length * 0.5);
}
