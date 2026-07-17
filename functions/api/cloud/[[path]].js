import {
    corsHeaders,
    jsonResponse,
    handleGetIndex,
    handleGetPages,
    handleGetPage,
    handlePublish,
    handleIndexChapterPut,
    handleStatus,
    apiOriginFromRequest
} from "../../../scripts/cloud/cloud-api-core.mjs";
import { bindWorkerEnv } from "../../../scripts/cloud/worker-bind-env.mjs";

function routePath(pathname) {
    const p = pathname.replace(/\/$/, "") || "/";
    return {
        isRoot: p === "/api/cloud",
        isStatus: p.endsWith("/status") || p.includes("/cloud/status") || p === "/api/cloud",
        isIndex: p.endsWith("/chapters-index") || p.endsWith("/index"),
        isPages: p.endsWith("/pages") || p.includes("/cloud/pages"),
        isPage: p.endsWith("/page") || p.includes("/cloud/page"),
        isPublish: p.endsWith("/publish") || p.includes("/cloud/publish"),
        isIndexChapter: p.endsWith("/index/chapter") || p.includes("/cloud/index/chapter")
    };
}

export async function onRequest(context) {
    const { request, env } = context;
    bindWorkerEnv(env);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const routes = routePath(url.pathname);
    const origin = apiOriginFromRequest(request, env);
    const bucket = env.CHAPTERS || null;

    const mangaId = (url.searchParams.get("m") || url.searchParams.get("mangaId") || "").trim();
    const capId = (url.searchParams.get("ch") || url.searchParams.get("capId") || "").trim();

    try {
        if (request.method === "POST" && routes.isPublish) {
            return handlePublish(request, env, origin);
        }

        if (request.method === "PUT" && routes.isIndexChapter) {
            return handleIndexChapterPut(request, env);
        }

        if (request.method !== "GET") {
            return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
        }

        if (routes.isStatus || routes.isRoot) {
            return handleStatus(bucket, mangaId, capId);
        }

        if (routes.isIndex) {
            return handleGetIndex(bucket);
        }

        if (routes.isPage) {
            const n = url.searchParams.get("n");
            if (!mangaId || !capId || !n) {
                return jsonResponse({ error: "Parâmetros m, ch, n obrigatórios." }, 400);
            }
            if (!bucket) {
                return jsonResponse({ error: "R2 CHAPTERS não configurado." }, 503);
            }
            return handleGetPage(bucket, mangaId, capId, n);
        }

        if (routes.isPages || (mangaId && capId)) {
            if (!mangaId || !capId) {
                return jsonResponse({ error: "Parâmetros m e ch obrigatórios." }, 400);
            }
            if (!bucket) {
                return jsonResponse({ error: "R2 CHAPTERS não configurado." }, 503);
            }
            return handleGetPages(bucket, origin, mangaId, capId);
        }

        return jsonResponse({
            error: "Rota inválida.",
            hint: "Use /api/cloud/chapters-index, /api/cloud/pages?m=&ch=, /api/cloud/page?m=&ch=&n= ou /api/cloud/status."
        }, 404);
    } catch (e) {
        return jsonResponse({ error: e?.message || "Erro interno." }, 502);
    }
}
