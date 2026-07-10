import {
    paginasComUrlsEstaveis,
    buscarPaginaRemota
} from "../../scripts/cloud/cloud-resolver.mjs";

function corsHeaders(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        ...extra
    };
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders({ "Content-Type": "application/json", "Cache-Control": "no-store" })
    });
}

function apiOrigin(req) {
    return process.env.URL || process.env.DEPLOY_URL || `https://${req.headers.get("host")}`;
}

export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (req.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, "");
    const isPage = pathname.endsWith("/page") || pathname.includes("/cloud/page");
    const isPages = pathname.endsWith("/pages") || pathname.includes("/cloud/pages");

    const mangaId = url.searchParams.get("m")?.trim();
    const capId = url.searchParams.get("ch")?.trim();

    try {
        if (isPage) {
            const n = url.searchParams.get("n");
            if (!mangaId || !capId || !n) {
                return json({ error: "Parâmetros m, ch, n obrigatórios." }, 400);
            }
            const { contentType, buffer } = await buscarPaginaRemota(mangaId, capId, n);
            return new Response(buffer, {
                status: 200,
                headers: corsHeaders({
                    "Content-Type": contentType,
                    "Cache-Control": "public, max-age=86400, immutable"
                })
            });
        }

        if (isPages || (!isPage && mangaId && capId)) {
            if (!mangaId || !capId) {
                return json({ error: "Parâmetros m e ch obrigatórios." }, 400);
            }
            const pages = await paginasComUrlsEstaveis(mangaId, capId, apiOrigin(req));
            return json({ pages });
        }

        return json({ error: "Rota inválida." }, 404);
    } catch (e) {
        return json({ error: e.message || "Erro ao carregar capítulo." }, 502);
    }
};
