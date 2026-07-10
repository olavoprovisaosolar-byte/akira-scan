import {
    paginasComUrlsEstaveis,
    buscarPaginaRemota,
    capInfo
} from "../../scripts/cloud/cloud-resolver.mjs";

function envGet(key) {
    try {
        if (typeof Netlify !== "undefined" && Netlify.env?.get) {
            const v = Netlify.env.get(key);
            if (v != null && v !== "") return v;
        }
    } catch { /* local / sem Netlify */ }
    return process.env[key];
}

function corsHeaders(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
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
    return envGet("URL") || envGet("DEPLOY_URL") || `https://${req.headers.get("host")}`;
}

export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (req.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    const isPage = pathname.endsWith("/page") || pathname.includes("/cloud/page");
    const isPages = pathname.endsWith("/pages") || pathname.includes("/cloud/pages");
    const isStatus = pathname.endsWith("/status") || pathname.includes("/cloud/status");

    const mangaId = (url.searchParams.get("m") || url.searchParams.get("mangaId") || "").trim();
    const capId = (url.searchParams.get("ch") || url.searchParams.get("capId") || "").trim();

    try {
        if (isStatus || pathname === "/api/cloud") {
            const info = mangaId && capId ? capInfo(mangaId, capId) : null;
            return json({
                ok: true,
                service: "cloud-chapters",
                hasTerabox: Boolean(envGet("TERABOX_NDUS") || envGet("TERABOX_COOKIE")),
                cap: info ? { done: info.done, remote: Boolean(info.remote), purged: Boolean(info.localPurged) } : null
            });
        }

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

        if (isPages || (mangaId && capId)) {
            if (!mangaId || !capId) {
                return json({ error: "Parâmetros m e ch obrigatórios." }, 400);
            }
            const pages = await paginasComUrlsEstaveis(mangaId, capId, apiOrigin(req));
            return json({ pages, mangaId, capId, total: pages.length });
        }

        return json({ error: "Rota inválida. Use /api/cloud/pages?m=&ch= ou /api/cloud/status." }, 404);
    } catch (e) {
        return json({ error: e.message || "Erro ao carregar capítulo." }, 502);
    }
};

export const config = {
    path: ["/api/cloud", "/api/cloud/pages", "/api/cloud/page", "/api/cloud/status"]
};
