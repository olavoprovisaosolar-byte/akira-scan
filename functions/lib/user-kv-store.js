/**
 * Contas / sessões / perfil em Workers KV (binding AKIRA_USERS).
 */
import {
    criarToken,
    criarUid,
    expiraSessao,
    hashEmail,
    hashSenha,
    normalizarUsername,
    validarUsername,
    verificarSenha
} from "./user-crypto.js";

const DEMO_EMAIL = "demo@akirascan.com";
const DEMO_SENHA = "akira123";

function kv(env) {
    const store = env.AKIRA_USERS;
    if (!store) throw new Error("KV AKIRA_USERS não configurado");
    return store;
}

async function getJson(store, key) {
    const raw = await store.get(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function putJson(store, key, value) {
    await store.put(key, JSON.stringify(value));
}

function chaveConta(emailHash) {
    return `account:${emailHash}`;
}

function chaveUsername(username) {
    return `username:${username}`;
}

function chaveDados(uid) {
    return `data:${uid}`;
}

function chaveSessao(token) {
    return `session:${token}`;
}

export function dadosVazios(username = "") {
    return {
        favoritos: [],
        historico: {},
        perfil: {
            nome: username || "",
            username: username || "",
            avatar: "",
            bio: "",
            banner: ""
        },
        ultimaAtualizacao: null
    };
}

export async function registarUtilizador(env, email, senha, usernameRaw) {
    const store = kv(env);
    const emailNorm = String(email).trim().toLowerCase();
    if (!emailNorm || !emailNorm.includes("@")) {
        return { ok: false, mensagem: "E-mail inválido." };
    }
    if (String(senha).length < 6) {
        return { ok: false, mensagem: "A senha deve ter pelo menos 6 caracteres." };
    }
    const userCheck = validarUsername(usernameRaw);
    if (!userCheck.ok) return userCheck;
    const username = userCheck.username;

    const emailHash = await hashEmail(emailNorm);
    if (await getJson(store, chaveConta(emailHash))) {
        return { ok: false, mensagem: "Este e-mail já está registado. Usa Entrar." };
    }
    if (await store.get(chaveUsername(username))) {
        return { ok: false, mensagem: "Este username já está em uso." };
    }

    const { salt, hash, algo } = await hashSenha(senha);
    const uid = await criarUid(emailNorm);
    const conta = {
        uid,
        email: emailNorm,
        username,
        salt,
        hash,
        algo,
        createdAt: new Date().toISOString()
    };
    await putJson(store, chaveConta(emailHash), conta);
    await store.put(chaveUsername(username), uid);
    await putJson(store, chaveDados(uid), dadosVazios(username));

    const token = criarToken();
    await putJson(store, chaveSessao(token), {
        uid,
        email: emailNorm,
        username,
        expiresAt: expiraSessao()
    });

    return { ok: true, novo: true, uid, email: emailNorm, username, token };
}

export async function entrarUtilizador(env, email, senha) {
    const store = kv(env);
    const emailNorm = String(email).trim().toLowerCase();
    const emailHash = await hashEmail(emailNorm);
    let conta = await getJson(store, chaveConta(emailHash));

    if (!conta && emailNorm === DEMO_EMAIL && senha === DEMO_SENHA) {
        const userCheck = validarUsername("demo");
        const username = userCheck.username;
        const { salt, hash, algo } = await hashSenha(DEMO_SENHA);
        conta = {
            uid: "local_demo_akirascan",
            email: DEMO_EMAIL,
            username,
            salt,
            hash,
            algo,
            createdAt: new Date().toISOString(),
            demo: true
        };
        await putJson(store, chaveConta(emailHash), conta);
        if (!(await store.get(chaveUsername(username)))) {
            await store.put(chaveUsername(username), conta.uid);
        }
        if (!(await getJson(store, chaveDados(conta.uid)))) {
            await putJson(store, chaveDados(conta.uid), dadosVazios(username));
        }
    }

    if (!conta) {
        return { ok: false, mensagem: "Conta não encontrada. Cria uma conta primeiro." };
    }

    if (!(await verificarSenha(senha, conta.salt, conta.hash))) {
        return { ok: false, mensagem: "Senha incorreta." };
    }

    const token = criarToken();
    await putJson(store, chaveSessao(token), {
        uid: conta.uid,
        email: conta.email,
        username: conta.username || "",
        expiresAt: expiraSessao()
    });

    return {
        ok: true,
        uid: conta.uid,
        email: conta.email,
        username: conta.username || "",
        token
    };
}

export async function validarSessao(env, token) {
    if (!token) return null;
    const store = kv(env);
    const sessao = await getJson(store, chaveSessao(token));
    if (!sessao) return null;
    if (sessao.expiresAt && Date.now() > sessao.expiresAt) {
        await store.delete(chaveSessao(token));
        return null;
    }
    return sessao;
}

export async function terminarSessao(env, token) {
    if (token) await kv(env).delete(chaveSessao(token));
}

export async function obterDados(env, uid) {
    return (await getJson(kv(env), chaveDados(uid))) || dadosVazios();
}

export async function obterContaPorUid(env, uid) {
    const store = kv(env);
    // Varre não é possível — guardar índice uid→emailHash no data ou na sessão
    // Conta completa via data + session; para username update lemos data + session
    const dados = await obterDados(env, uid);
    return { uid, username: dados?.perfil?.username || "" };
}

export async function guardarDados(env, uid, payload) {
    const store = kv(env);
    const atual = await obterDados(env, uid);
    const mesclado = {
        favoritos: payload.favoritos ?? atual.favoritos ?? [],
        historico: { ...atual.historico, ...(payload.historico || {}) },
        perfil: {
            nome: String(payload.perfil?.nome ?? atual.perfil?.nome ?? "").trim().slice(0, 32),
            username: String(payload.perfil?.username ?? atual.perfil?.username ?? "").trim().slice(0, 20),
            avatar: payload.perfil?.avatar ?? atual.perfil?.avatar ?? "",
            bio: String(payload.perfil?.bio ?? atual.perfil?.bio ?? "").trim().slice(0, 160),
            banner: payload.perfil?.banner ?? atual.perfil?.banner ?? ""
        },
        ultimaAtualizacao: payload.ultimaAtualizacao || new Date().toISOString()
    };
    await putJson(store, chaveDados(uid), mesclado);
    return mesclado;
}

/** Atualiza username único (liberta o antigo). */
export async function atualizarUsername(env, uid, email, usernameRaw) {
    const store = kv(env);
    const check = validarUsername(usernameRaw);
    if (!check.ok) return check;
    const username = check.username;

    const dados = await obterDados(env, uid);
    const atual = normalizarUsername(dados.perfil?.username || "");
    if (atual === username) {
        return { ok: true, username };
    }

    const occupied = await store.get(chaveUsername(username));
    if (occupied && occupied !== uid) {
        return { ok: false, mensagem: "Este username já está em uso." };
    }

    if (atual) await store.delete(chaveUsername(atual));
    await store.put(chaveUsername(username), uid);

    const emailHash = await hashEmail(email);
    const conta = await getJson(store, chaveConta(emailHash));
    if (conta) {
        conta.username = username;
        await putJson(store, chaveConta(emailHash), conta);
    }

    dados.perfil = {
        ...dados.perfil,
        username,
        nome: dados.perfil?.nome || username
    };
    dados.ultimaAtualizacao = new Date().toISOString();
    await putJson(store, chaveDados(uid), dados);

    return { ok: true, username, perfil: dados.perfil };
}

export async function guardarAvatarUrl(env, uid, url) {
    const store = kv(env);
    const dados = await obterDados(env, uid);
    dados.perfil = { ...dados.perfil, avatar: String(url || "") };
    dados.ultimaAtualizacao = new Date().toISOString();
    await putJson(store, chaveDados(uid), dados);
    return dados.perfil;
}

export async function uploadImgbb(env, dataUrlOrBase64, name = "avatar") {
    const key = env.IMGBB_API_KEY || env.IMGBB_KEY;
    if (!key) throw new Error("IMGBB_API_KEY ausente");

    let b64 = String(dataUrlOrBase64 || "");
    const m = b64.match(/^data:image\/\w+;base64,(.+)$/);
    if (m) b64 = m[1];
    if (!b64 || b64.length < 32) throw new Error("Imagem inválida");
    // ~200KB base64 max
    if (b64.length > 280000) throw new Error("Imagem demasiado grande (máx ~200 KB comprimida)");

    const body = new URLSearchParams();
    body.set("key", key);
    body.set("image", b64);
    body.set("name", String(name).slice(0, 64));

    const res = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });
    const data = await res.json().catch(() => ({}));
    const url = data?.data?.url || data?.data?.display_url;
    if (!res.ok || !url) {
        const msg = data?.error?.message || `ImgBB HTTP ${res.status}`;
        throw new Error(msg);
    }
    return String(url);
}
