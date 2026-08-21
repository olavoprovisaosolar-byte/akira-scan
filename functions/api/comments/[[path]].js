/**
 * Cloudflare Pages — /api/comments/*
 * Comentários por mangá em KV AKIRA_COMMENTS (auth via AKIRA_USERS).
 */
import { validarSessao, obterDados } from "../../lib/user-kv-store.js";

const MAX_PER_MANGA = 100;
const MAX_TEXTO = 800;

function cors(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        ...extra
    };
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: cors({ "Content-Type": "application/json", "Cache-Control": "no-store" })
    });
}

function extrairToken(req) {
    const auth = req.headers.get("authorization") || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || "";
}

function chaveManga(mangaId) {
    return `manga:${String(mangaId || "").trim()}`;
}

async function lerLista(env, mangaId) {
    const raw = await env.AKIRA_COMMENTS.get(chaveManga(mangaId));
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
    }

    if (!env.AKIRA_COMMENTS) {
        return json({ ok: false, mensagem: "KV AKIRA_COMMENTS não ligado." }, 503);
    }

    const url = new URL(request.url);

    try {
        if (request.method === "GET") {
            const mangaId = (url.searchParams.get("mangaId") || url.searchParams.get("m") || "").trim();
            if (!mangaId) return json({ ok: false, mensagem: "mangaId obrigatório." }, 400);
            const lista = await lerLista(env, mangaId);
            return json({ ok: true, mangaId, comments: lista });
        }

        if (request.method === "POST") {
            if (!env.AKIRA_USERS) {
                return json({ ok: false, mensagem: "KV AKIRA_USERS não ligado." }, 503);
            }
            const sessao = await validarSessao(env, extrairToken(request));
            if (!sessao) return json({ ok: false, mensagem: "Inicia sessão para comentar." }, 401);

            const body = await request.json();
            const mangaId = String(body.mangaId || "").trim();
            const texto = String(body.texto || "").trim().slice(0, MAX_TEXTO);
            if (!mangaId) return json({ ok: false, mensagem: "mangaId obrigatório." }, 400);
            if (!texto) return json({ ok: false, mensagem: "Escreve um comentário." }, 400);

            const dados = await obterDados(env, sessao.uid);
            const username = sessao.username
                || dados.perfil?.username
                || dados.perfil?.nome
                || "leitor";

            const entry = {
                id: `c-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
                uid: sessao.uid,
                username: String(username).slice(0, 20),
                autor: String(username).slice(0, 32),
                texto,
                ts: Date.now()
            };

            const lista = await lerLista(env, mangaId);
            lista.unshift(entry);
            await env.AKIRA_COMMENTS.put(
                chaveManga(mangaId),
                JSON.stringify(lista.slice(0, MAX_PER_MANGA))
            );

            return json({ ok: true, comment: entry });
        }

        return json({ ok: false, mensagem: "Método não permitido." }, 405);
    } catch (error) {
        console.error("[comments-api]", error);
        return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
    }
}
