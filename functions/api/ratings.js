/**
 * Notas 1–5 por mangá (KV AKIRA_COMMENTS) + voto autenticado (AKIRA_USERS).
 */
import { validarSessao } from "../lib/user-kv-store.js";

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

function chave(mangaId) {
    return `rating:${String(mangaId || "").trim()}`;
}

async function ler(env, mangaId) {
    const raw = await env.AKIRA_COMMENTS.get(chave(mangaId));
    if (!raw) return { sum: 0, count: 0, byUid: {} };
    try {
        const data = JSON.parse(raw);
        return {
            sum: Number(data.sum) || 0,
            count: Number(data.count) || 0,
            byUid: data.byUid && typeof data.byUid === "object" ? data.byUid : {}
        };
    } catch {
        return { sum: 0, count: 0, byUid: {} };
    }
}

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
    }
    if (!env.AKIRA_COMMENTS) {
        return json({ ok: false, mensagem: "KV não ligado." }, 503);
    }

    const url = new URL(request.url);

    try {
        if (request.method === "GET") {
            const mangaId = (url.searchParams.get("mangaId") || url.searchParams.get("m") || "").trim();
            if (!mangaId) return json({ ok: false, mensagem: "mangaId obrigatório." }, 400);
            const rec = await ler(env, mangaId);
            let mine = 0;
            if (env.AKIRA_USERS) {
                const sessao = await validarSessao(env, extrairToken(request));
                if (sessao?.uid) mine = Number(rec.byUid[sessao.uid]) || 0;
            }
            const avg = rec.count ? rec.sum / rec.count : 0;
            return json({ ok: true, mangaId, avg: Math.round(avg * 10) / 10, count: rec.count, mine });
        }

        if (request.method === "POST") {
            if (!env.AKIRA_USERS) return json({ ok: false, mensagem: "KV AKIRA_USERS não ligado." }, 503);
            const sessao = await validarSessao(env, extrairToken(request));
            if (!sessao) return json({ ok: false, mensagem: "Inicia sessão para votar." }, 401);
            const body = await request.json();
            const mangaId = String(body.mangaId || "").trim();
            const score = Math.round(Number(body.score));
            if (!mangaId) return json({ ok: false, mensagem: "mangaId obrigatório." }, 400);
            if (score < 1 || score > 5) return json({ ok: false, mensagem: "Nota de 1 a 5." }, 400);

            const rec = await ler(env, mangaId);
            const prev = Number(rec.byUid[sessao.uid]) || 0;
            if (prev) {
                rec.sum -= prev;
                rec.count -= 1;
            }
            rec.byUid[sessao.uid] = score;
            rec.sum += score;
            rec.count += 1;
            await env.AKIRA_COMMENTS.put(chave(mangaId), JSON.stringify(rec));
            const avg = rec.count ? rec.sum / rec.count : score;
            return json({ ok: true, avg: Math.round(avg * 10) / 10, count: rec.count, mine: score });
        }

        return json({ ok: false, mensagem: "Método não permitido." }, 405);
    } catch (error) {
        console.error("[ratings]", error);
        return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
    }
}
