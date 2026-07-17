/**
 * Cliente da API de utilizadores (Netlify Blobs).
 */
import { cloudApiUrl, USER_API_BASE } from "./site-config.js";

const SESSION_KEY = "akirascan_sessao";

function baseUrl(acao) {
    if (USER_API_BASE) {
        const base = USER_API_BASE.replace(/\/$/, "");
        return `${base}/api/user/${acao}`;
    }
    return cloudApiUrl(`api/user/${acao}`);
}

function lerSessao() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function authHeaders() {
    const sessao = lerSessao();
    const headers = { "Content-Type": "application/json" };
    if (sessao?.token) headers.Authorization = `Bearer ${sessao.token}`;
    return headers;
}

async function pedir(acao, opts = {}) {
    const res = await fetch(baseUrl(acao), {
        ...opts,
        headers: { ...authHeaders(), ...(opts.headers || {}) }
    });
    let data = {};
    try {
        data = await res.json();
    } catch {
        data = { ok: false, mensagem: "Resposta inválida do servidor." };
    }
    return { res, data };
}

export async function apiRegistar(email, senha) {
    const { res, data } = await pedir("register", {
        method: "POST",
        body: JSON.stringify({ email, senha })
    });
    return { ...data, status: res.status };
}

export async function apiEntrar(email, senha) {
    const { res, data } = await pedir("login", {
        method: "POST",
        body: JSON.stringify({ email, senha })
    });
    return { ...data, status: res.status };
}

export async function apiSair() {
    try {
        await pedir("logout", { method: "POST" });
    } catch { /* offline */ }
}

export async function apiValidarSessao() {
    const sessao = lerSessao();
    if (!sessao?.token) return null;
    try {
        const { res, data } = await pedir("me", { method: "GET" });
        if (!res.ok || !data.ok) return null;
        return { uid: data.uid, email: data.email, token: sessao.token };
    } catch {
        return sessao;
    }
}

export async function apiObterDados() {
    const { res, data } = await pedir("data", { method: "GET" });
    if (!res.ok || !data.ok) return null;
    return {
        favoritos: data.favoritos || [],
        historico: data.historico || {},
        ultimaAtualizacao: data.ultimaAtualizacao || null
    };
}

export async function apiGuardarDados(payload) {
    const { res, data } = await pedir("data", {
        method: "PUT",
        body: JSON.stringify(payload)
    });
    if (!res.ok || !data.ok) return false;
    return true;
}

export function temSessaoApi() {
    return Boolean(lerSessao()?.token);
}
