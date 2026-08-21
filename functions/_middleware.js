/**
 * Cloudflare Pages middleware — /obra/* serve a SPA (index.html).
 * O cliente (parseRoute + home-page) trata detalhes vs redirecionamento ao leitor.
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/obra" || path.startsWith("/obra/")) {
        if (!context.env?.ASSETS) return context.next();
        const assetUrl = new URL("/index.html", url.origin);
        return context.env.ASSETS.fetch(assetUrl);
    }

    return context.next();
}
