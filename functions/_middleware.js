/**
 * Cloudflare Pages middleware — rotas Madara /obra/*.
 *  - /obra/:id        → index.html (página da obra)
 *  - /obra/:id/:cap   → leitor.html?m=&n=
 */
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

    if (parts[0] !== "obra" || !parts[1] || !context.env?.ASSETS) {
        return context.next();
    }

    if (parts.length >= 3) {
        const dest = new URL("/leitor.html", url.origin);
        dest.searchParams.set("m", parts[1]);
        dest.searchParams.set("id", parts[1]);
        dest.searchParams.set("n", parts[2]);
        const ch = url.searchParams.get("ch");
        if (ch) dest.searchParams.set("ch", ch);
        return Response.redirect(dest.toString(), 302);
    }

    return context.env.ASSETS.fetch(new URL("/index.html", url.origin));
}
