/**
 * Cloudflare Pages middleware — rotas Madara /obra/*.
 *  - /obra/:id        → index.html (página da obra)
 *  - /obra/:id/:cap   → leitor.html (URL no browser fica /obra/...; sem redirect)
 *
 * NÃO usar Response.redirect para leitor.html — o Pretty URL da Pages
 * (/leitor.html → /leitor) + rewrite /leitor → /leitor.html cria loop 308.
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

    if (parts[0] !== "obra" || !parts[1] || !context.env?.ASSETS) {
        return context.next();
    }

    if (parts.length >= 3) {
        const assetUrl = new URL("/leitor.html", url.origin);
        // Query ajuda fallbacks; o router também lê /obra/:id/:cap do pathname.
        assetUrl.searchParams.set("m", parts[1]);
        assetUrl.searchParams.set("id", parts[1]);
        assetUrl.searchParams.set("n", parts[2]);
        const ch = url.searchParams.get("ch");
        if (ch) assetUrl.searchParams.set("ch", ch);
        return context.env.ASSETS.fetch(assetUrl);
    }

    return context.env.ASSETS.fetch(new URL("/index.html", url.origin));
}
