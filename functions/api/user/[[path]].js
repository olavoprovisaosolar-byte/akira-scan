/**
 * Cloudflare Pages — /api/user/*
 * Contas + username + perfil + avatar (ImgBB) em KV AKIRA_USERS.
 */
import {
    atualizarUsername,
    entrarUtilizador,
    guardarAvatarUrl,
    guardarDados,
    obterDados,
    registarUtilizador,
    terminarSessao,
    uploadImgbb,
    validarSessao
} from "../../lib/user-kv-store.js";

function cors(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
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

function extrairAcao(pathname) {
    const p = String(pathname || "").replace(/\/$/, "");
    const parts = p.split("/api/user/");
    if (parts.length < 2) return "";
    return (parts[1].split("/")[0] || "").trim();
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
    }

    if (!env.AKIRA_USERS) {
        return json({ ok: false, mensagem: "KV AKIRA_USERS não ligado." }, 503);
    }

    const url = new URL(request.url);
    const acao = extrairAcao(url.pathname);

    try {
        if (acao === "register" && request.method === "POST") {
            const body = await request.json();
            const resultado = await registarUtilizador(env, body.email, body.senha, body.username);
            return json(resultado, resultado.ok ? 200 : 400);
        }

        if (acao === "login" && request.method === "POST") {
            const body = await request.json();
            const resultado = await entrarUtilizador(env, body.email, body.senha);
            return json(resultado, resultado.ok ? 200 : 401);
        }

        if (acao === "logout" && request.method === "POST") {
            await terminarSessao(env, extrairToken(request));
            return json({ ok: true });
        }

        if ((acao === "me" || acao === "session") && request.method === "GET") {
            const sessao = await validarSessao(env, extrairToken(request));
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            const dados = await obterDados(env, sessao.uid);
            return json({
                ok: true,
                uid: sessao.uid,
                email: sessao.email,
                username: sessao.username || dados.perfil?.username || "",
                perfil: dados.perfil || {}
            });
        }

        if (acao === "data" && request.method === "GET") {
            const sessao = await validarSessao(env, extrairToken(request));
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            const dados = await obterDados(env, sessao.uid);
            return json({ ok: true, ...dados });
        }

        if (acao === "data" && request.method === "PUT") {
            const sessao = await validarSessao(env, extrairToken(request));
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            const body = await request.json();
            // username só via /username
            if (body?.perfil) {
                delete body.perfil.username;
            }
            const dados = await guardarDados(env, sessao.uid, body);
            return json({ ok: true, ...dados });
        }

        if (acao === "username" && request.method === "POST") {
            const sessao = await validarSessao(env, extrairToken(request));
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            const body = await request.json();
            const resultado = await atualizarUsername(env, sessao.uid, sessao.email, body.username);
            return json(resultado, resultado.ok ? 200 : 400);
        }

        if (acao === "avatar" && request.method === "POST") {
            const sessao = await validarSessao(env, extrairToken(request));
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            const body = await request.json();
            const image = body.image || body.dataUrl || body.base64;
            if (!image) return json({ ok: false, mensagem: "Imagem em falta." }, 400);
            try {
                const urlImg = await uploadImgbb(env, image, `akira-${sessao.uid}-avatar`);
                const perfil = await guardarAvatarUrl(env, sessao.uid, urlImg);
                return json({ ok: true, url: urlImg, perfil });
            } catch (e) {
                return json({ ok: false, mensagem: e.message || "Falha no upload." }, 400);
            }
        }

        return json({ ok: false, mensagem: "Rota não encontrada." }, 404);
    } catch (error) {
        console.error("[user-api]", error);
        return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
    }
}
