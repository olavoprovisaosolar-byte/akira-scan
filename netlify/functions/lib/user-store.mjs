import { getStore } from "@netlify/blobs";
import { criarUid, criarToken, expiraSessao, hashEmail, hashSenha, verificarSenha } from "./user-crypto.mjs";

const STORE = "akira-users";
const DEMO_EMAIL = "demo@akirascan.com";
const DEMO_SENHA = "akira123";

function store() {
    return getStore({ name: STORE, consistency: "strong" });
}

function chaveConta(email) {
    return `account:${hashEmail(email)}`;
}

function chaveDados(uid) {
    return `data:${uid}`;
}

function chaveSessao(token) {
    return `session:${token}`;
}

export function dadosVazios() {
    return { favoritos: [], historico: {}, ultimaAtualizacao: null };
}

async function lerConta(email) {
    return store().get(chaveConta(email), { type: "json" });
}

async function guardarConta(email, conta) {
    await store().setJSON(chaveConta(email), conta);
}

export async function registarUtilizador(email, senha) {
    const emailNorm = String(email).trim().toLowerCase();
    if (!emailNorm || !emailNorm.includes("@")) {
        return { ok: false, mensagem: "E-mail inválido." };
    }
    if (String(senha).length < 6) {
        return { ok: false, mensagem: "A senha deve ter pelo menos 6 caracteres." };
    }

    const existente = await lerConta(emailNorm);
    if (existente) {
        return { ok: false, mensagem: "Este e-mail já está registado. Usa Entrar." };
    }

    const { salt, hash } = hashSenha(senha);
    const uid = criarUid(emailNorm);
    await guardarConta(emailNorm, {
        uid,
        email: emailNorm,
        salt,
        hash,
        createdAt: new Date().toISOString()
    });
    await store().setJSON(chaveDados(uid), dadosVazios());

    const token = criarToken();
    await store().setJSON(chaveSessao(token), {
        uid,
        email: emailNorm,
        expiresAt: expiraSessao()
    });

    return { ok: true, novo: true, uid, email: emailNorm, token };
}

export async function entrarUtilizador(email, senha) {
    const emailNorm = String(email).trim().toLowerCase();
    let conta = await lerConta(emailNorm);

    if (!conta && emailNorm === DEMO_EMAIL && senha === DEMO_SENHA) {
        const { salt, hash } = hashSenha(DEMO_SENHA);
        conta = {
            uid: "local_demo_akirascan",
            email: DEMO_EMAIL,
            salt,
            hash,
            createdAt: new Date().toISOString(),
            demo: true
        };
        await guardarConta(emailNorm, conta);
        const dados = await store().get(chaveDados(conta.uid), { type: "json" });
        if (!dados) {
            await store().setJSON(chaveDados(conta.uid), dadosVazios());
        }
    }

    if (!conta) {
        return { ok: false, mensagem: "Conta não encontrada. Cria uma conta primeiro." };
    }

    if (!verificarSenha(senha, conta.salt, conta.hash)) {
        return { ok: false, mensagem: "Senha incorreta." };
    }

    const token = criarToken();
    await store().setJSON(chaveSessao(token), {
        uid: conta.uid,
        email: conta.email,
        expiresAt: expiraSessao()
    });

    return { ok: true, uid: conta.uid, email: conta.email, token };
}

export async function validarSessao(token) {
    if (!token) return null;
    const sessao = await store().get(chaveSessao(token), { type: "json" });
    if (!sessao) return null;
    if (sessao.expiresAt && Date.now() > sessao.expiresAt) {
        await store().delete(chaveSessao(token));
        return null;
    }
    return sessao;
}

export async function terminarSessao(token) {
    if (token) await store().delete(chaveSessao(token));
}

export async function obterDados(uid) {
    const dados = await store().get(chaveDados(uid), { type: "json" });
    return dados || dadosVazios();
}

export async function guardarDados(uid, payload) {
    const atual = await obterDados(uid);
    const mesclado = {
        favoritos: payload.favoritos ?? atual.favoritos ?? [],
        historico: { ...atual.historico, ...(payload.historico || {}) },
        ultimaAtualizacao: payload.ultimaAtualizacao || new Date().toISOString()
    };
    await store().setJSON(chaveDados(uid), mesclado);
    return mesclado;
}
