/**
 * Leitura do índice cloud — core worker-safe (sem fs).
 */
let indexOverride = null;

/** Índice injetado em runtime (Cloudflare Pages Functions — sem fs). */
export function setIndexOverride(data) {
    indexOverride = data && typeof data === "object" ? data : null;
}

export function getIndexOverride() {
    return indexOverride;
}

function lerIndice() {
    return indexOverride || { caps: {} };
}

export function capInfo(mangaId, capId) {
    const idx = lerIndice();
    return idx.caps?.[`${mangaId}/${capId}`] || null;
}

export function isLegibleCloudUrl(url) {
    const u = String(url || "");
    return u.includes("telegra.ph")
        || u.includes("catbox.moe")
        || u.includes("/api/cloud/page")
        || u.includes("/data/cloud/pages/");
}

export function capTemTelegra(info) {
    return !!(info?.pages?.length && info.pages.some((p) => isLegibleCloudUrl(p.url)));
}

export function paginasTelegra(info) {
    if (!capTemTelegra(info)) return [];
    return info.pages
        .filter((p) => isLegibleCloudUrl(p.url))
        .map((p, i) => ({
            index: p.index ?? i,
            url: p.url,
            origem: p.origem || (String(p.url).includes("telegra.ph") ? "telegra" : String(p.url).includes("catbox.moe") ? "catbox" : "cloud-static")
        }));
}
