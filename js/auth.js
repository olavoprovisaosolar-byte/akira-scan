import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth, firebaseAtivo, firebaseConfigurado } from "./firebase-config.js";
import {
    entrarLocal,
    registarLocal,
    observarAuthLocal,
    sairLocal,
    usuarioLocalAtual,
    garantirContaDemo,
    entrarComDemo
} from "./local-auth.js";

const ERROS_PT = {
    "auth/email-already-in-use": "Este e-mail já está registado. Usa Entrar.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
    "auth/user-not-found": "Conta não encontrada. Cria uma conta primeiro.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Tenta novamente mais tarde.",
    "auth/popup-closed-by-user": null,
    "auth/account-exists-with-different-credential": "Já existe conta com este e-mail. Entra com e-mail e senha.",
    "auth/operation-not-allowed": "Este método de login não está ativo no Firebase Console.",
    "auth/network-request-failed": "Sem ligação à internet. Verifica a rede."
};

function traduzirErro(code) {
    return ERROS_PT[code] || "Ocorreu um erro. Tenta novamente.";
}

function isLocalhost() {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
}

export async function processarRetornoGoogle() {
    if (!firebaseAtivo()) {
        return { ok: false };
    }

    try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
            return { ok: true };
        }
        return { ok: false };
    } catch (error) {
        return { ok: false, mensagem: traduzirErro(error.code) };
    }
}

export function usaFirebase() {
    return firebaseAtivo();
}

export async function entrarComEmail(email, senha) {
    if (!firebaseAtivo()) {
        return entrarLocal(email, senha);
    }

    try {
        await signInWithEmailAndPassword(auth, email.trim(), senha);
        return { ok: true };
    } catch (error) {
        return { ok: false, mensagem: traduzirErro(error.code) };
    }
}

export async function registarComEmail(email, senha) {
    if (senha.length < 6) {
        return { ok: false, mensagem: "A senha deve ter pelo menos 6 caracteres." };
    }

    if (!firebaseAtivo()) {
        return registarLocal(email, senha);
    }

    try {
        await createUserWithEmailAndPassword(auth, email.trim(), senha);
        return { ok: true, novo: true };
    } catch (error) {
        return { ok: false, mensagem: traduzirErro(error.code) };
    }
}

export async function entrarComGoogle() {
    if (!firebaseAtivo()) {
        return {
            ok: false,
            mensagem: "Login com Google requer Firebase configurado. Usa e-mail e senha por agora."
        };
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
        // Em localhost usa popup para a sessão ficar no teu site, não no firebaseapp.com
        if (isLocalhost()) {
            await signInWithPopup(auth, provider);
            return { ok: true };
        }

        await signInWithRedirect(auth, provider);
        return { ok: true, redirect: true };
    } catch (error) {
        if (error.code === "auth/popup-blocked") {
            await signInWithRedirect(auth, provider);
            return { ok: true, redirect: true };
        }
        const msg = traduzirErro(error.code);
        if (!msg) return { ok: false, cancelado: true };
        return { ok: false, mensagem: msg };
    }
}

export function observarAuth(callback) {
    if (!firebaseAtivo()) {
        return observarAuthLocal(callback);
    }
    return onAuthStateChanged(auth, callback);
}

export async function sair() {
    if (!firebaseAtivo()) {
        sairLocal();
        return;
    }
    await signOut(auth);
}

export function usuarioAtual() {
    if (!firebaseAtivo()) {
        return usuarioLocalAtual();
    }
    return auth?.currentUser ?? null;
}

export async function prepararContaDemo() {
    if (!firebaseAtivo()) {
        garantirContaDemo();
        return entrarComDemo();
    }
    return {
        ok: false,
        mensagem: "Conta demo só disponível sem Firebase. Configura o Firebase ou usa e-mail/senha."
    };
}

// Mantido por compatibilidade
export async function loginOuRegistar(email, senha) {
    const login = await entrarComEmail(email, senha);
    if (login.ok) return login;

    if (login.mensagem === "Conta não encontrada. Cria uma conta primeiro." ||
        login.mensagem?.includes("não encontrada")) {
        return registarComEmail(email, senha);
    }

    return login;
}
