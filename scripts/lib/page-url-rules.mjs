/**
 * Regras partilhadas (Node) — URLs de página que o site consegue servir de verdade.
 *
 * Legível agora:
 *  - hosts duráveis (iili, freeimage, ibb, files.catbox, telegra, pixeldrain)
 *  - API R2 (/api/cloud/page)
 *
 * NÃO legível (quebrados ou temporários):
 *  - litter.catbox.moe (expira)
 *  - /data/cloud/pages/ (omitidos do deploy / purged)
 *  - /api/discord-img (URLs Discord expiradas sem DISCORD_BOT_TOKEN)
 *  - /api/gh-cdn/ (GitHub API 403 → 502 até renovar GITHUB_CDN_TOKEN)
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
    return u.includes("/api/cloud/page");
}

/** URL que o leitor deve aceitar como página real (hoje). */
export function isServablePageUrl(url) {
    const u = String(url || "");
    if (!u || u.includes("litter.catbox.moe")) return false;
    if (u.includes("/data/cloud/pages/")) return false;
    if (u.includes("/api/discord-img")) return false;
    if (u.includes("/api/gh-cdn/")) return false;
    return isDurablePageUrl(u) || isWorkingProxyPageUrl(u);
}

/** Aceite estrutural no validador do leitor (inclui discord/gh-cdn para quando o secret existir). */
export function isStructurallyValidPageUrl(url) {
    const u = String(url || "");
    if (!u) return false;
    if (u.includes("litter.catbox.moe")) return false;
    if (u.includes("/data/cloud/pages/")) return false;
    return isDurablePageUrl(u)
        || isWorkingProxyPageUrl(u)
        || u.includes("/api/discord-img")
        || u.includes("/api/gh-cdn/")
        || /\.(webp|jpg|jpeg|png|gif)(\?|$)/i.test(u);
}

export function hasHostedPages(rec) {
    if (!rec?.pages?.length) return false;
    if (rec.localPurged && !(rec.pages || []).some((p) => isDurablePageUrl(p.url) || isWorkingProxyPageUrl(p.url))) {
        return false;
    }
    return rec.pages.some((p) => isServablePageUrl(p.url));
}

export function capLegivelIndice(rec) {
    return !!(rec?.done && hasHostedPages(rec));
}

export function pageUrlScore(url) {
    if (isDurablePageUrl(url)) return 3;
    if (isWorkingProxyPageUrl(url)) return 2;
    if (String(url || "").includes("/api/discord-img")) return 1;
    return 0;
}

export function capHostScore(rec) {
    let best = 0;
    for (const p of rec?.pages || []) {
        best = Math.max(best, pageUrlScore(p.url));
    }
    return best;
}
