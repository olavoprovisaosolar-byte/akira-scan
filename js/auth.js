import {
    entrarLocal,
    registarLocal,
    observarAuthLocal,
    sairLocal,
    usuarioLocalAtual,
    garantirContaDemo,
    entrarComDemo,
    definirSessao,
    CONTA_DEMO
} from "./local-auth.js";
import { apiEntrar, apiRegistar, apiSair } from "./user-api.js";

export function usaNuvem() {
    const user = usuarioLocalAtual();
    return Boolean(user?.token);
}

export async function entrarComEmail(email, senha) {
    try {
        const resultado = await apiEntrar(email, senha);
        if (resultado.ok) {
            definirSessao({
                uid: resultado.uid,
                email: resultado.email,
                token: resultado.token
            });
            return { ok: true };
        }
        if (resultado.status >= 500) {
            return entrarLocal(email, senha);
        }
        return { ok: false, mensagem: resultado.mensagem || "E-mail ou senha incorretos." };
    } catch {
        return entrarLocal(email, senha);
    }
}

export async function registarComEmail(email, senha) {
    if (senha.length < 6) {
        return { ok: false, mensagem: "A senha deve ter pelo menos 6 caracteres." };
    }

    try {
        const resultado = await apiRegistar(email, senha);
        if (resultado.ok) {
            definirSessao({
                uid: resultado.uid,
                email: resultado.email,
                token: resultado.token
            });
            return { ok: true, novo: true };
        }
        if (resultado.status >= 500) {
            return registarLocal(email, senha);
        }
        return { ok: false, mensagem: resultado.mensagem || "Não foi possível criar a conta." };
    } catch {
        return registarLocal(email, senha);
    }
}

export function observarAuth(callback) {
    return observarAuthLocal(callback);
}

export async function sair() {
    if (usaNuvem()) {
        await apiSair();
    }
    sairLocal();
}

export function usuarioAtual() {
    return usuarioLocalAtual();
}

export async function prepararContaDemo() {
    garantirContaDemo();
    const resultado = await entrarComEmail(CONTA_DEMO.email, CONTA_DEMO.senha);
    if (resultado.ok) return resultado;
    return entrarComDemo();
}

export { CONTA_DEMO };

// Mantido por compatibilidade
export async function loginOuRegistar(email, senha) {
    const login = await entrarComEmail(email, senha);
    if (login.ok) return login;

    if (login.mensagem?.includes("não encontrada")) {
        return registarComEmail(email, senha);
    }

    return login;
}

// Compatibilidade — Firebase/Google removidos
export function usaFirebase() {
    return false;
}

export async function processarRetornoGoogle() {
    return { ok: false };
}
