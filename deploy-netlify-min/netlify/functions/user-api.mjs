import {
    entrarUtilizador,
    guardarDados,
    obterDados,
    registarUtilizador,
    terminarSessao,
    validarSessao
} from "./lib/user-store.mjs";

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
    if (p.includes("/api/user/")) return p.split("/api/user/")[1].split("/")[0];
    if (p.includes("/user-api/")) return p.split("/user-api/")[1].split("/")[0];
    if (p.endsWith("/api/user") || p.endsWith("/user-api")) return "";
    return "";
}

export default async function handler(req) {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(req.url);
    const acao = extrairAcao(url.pathname);

    try {
        if (acao === "register" && req.method === "POST") {
            const body = await req.json();
            const resultado = await registarUtilizador(body.email, body.senha);
            return json(resultado, resultado.ok ? 200 : 400);
        }

        if (acao === "login" && req.method === "POST") {
            const body = await req.json();
            const resultado = await entrarUtilizador(body.email, body.senha);
            return json(resultado, resultado.ok ? 200 : 401);
        }

        if (acao === "logout" && req.method === "POST") {
            const token = extrairToken(req);
            await terminarSessao(token);
            return json({ ok: true });
        }

        if ((acao === "me" || acao === "session") && req.method === "GET") {
            const token = extrairToken(req);
            const sessao = await validarSessao(token);
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            return json({ ok: true, uid: sessao.uid, email: sessao.email });
        }

        if (acao === "data" && req.method === "GET") {
            const token = extrairToken(req);
            const sessao = await validarSessao(token);
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            const dados = await obterDados(sessao.uid);
            return json({ ok: true, ...dados });
        }

        if (acao === "data" && req.method === "PUT") {
            const token = extrairToken(req);
            const sessao = await validarSessao(token);
            if (!sessao) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
            const body = await req.json();
            const dados = await guardarDados(sessao.uid, body);
            return json({ ok: true, ...dados });
        }

        return json({ ok: false, mensagem: "Rota não encontrada." }, 404);
    } catch (error) {
        console.error("[user-api]", error);
        return json({ ok: false, mensagem: "Erro interno do servidor." }, 500);
    }
}
