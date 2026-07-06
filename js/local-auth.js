const USERS_KEY = "akirascan_usuarios";
const SESSION_KEY = "akirascan_sessao";

export const CONTA_DEMO = {
    email: "demo@akirascan.com",
    senha: "akira123",
    uid: "local_demo_akirascan"
};

const listeners = [];

function lerUsuarios() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
    } catch {
        return {};
    }
}

function guardarUsuarios(usuarios) {
    localStorage.setItem(USERS_KEY, JSON.stringify(usuarios));
}

export function lerSessaoLocal() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function definirSessao(user) {
    if (user) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
        localStorage.removeItem(SESSION_KEY);
    }
    listeners.forEach((cb) => cb(user));
}

export function observarAuthLocal(callback) {
    callback(lerSessaoLocal());
    listeners.push(callback);
}

export function garantirContaDemo() {
    const usuarios = lerUsuarios();
    const email = CONTA_DEMO.email;

    if (!usuarios[email]) {
        usuarios[email] = { senha: CONTA_DEMO.senha, uid: CONTA_DEMO.uid };
        guardarUsuarios(usuarios);
    }

    return true;
}

export function entrarComDemo() {
    garantirContaDemo();
    return entrarLocal(CONTA_DEMO.email, CONTA_DEMO.senha);
}

export function registarLocal(email, senha) {
    const emailNorm = email.trim().toLowerCase();

    if (senha.length < 6) {
        return { ok: false, mensagem: "A senha deve ter pelo menos 6 caracteres." };
    }

    const usuarios = lerUsuarios();
    if (usuarios[emailNorm]) {
        return { ok: false, mensagem: "Este e-mail já está registado. Usa Entrar." };
    }

    const uid = `local_${emailNorm.replace(/[^a-z0-9]/g, "_")}`;
    const user = { uid, email: emailNorm };
    usuarios[emailNorm] = { senha, uid: user.uid };
    guardarUsuarios(usuarios);
    definirSessao(user);
    return { ok: true, novo: true };
}

export function entrarLocal(email, senha) {
    const emailNorm = email.trim().toLowerCase();
    const usuarios = lerUsuarios();
    const conta = usuarios[emailNorm];

    if (!conta) {
        return { ok: false, mensagem: "Conta não encontrada. Cria uma conta primeiro." };
    }

    if (conta.senha !== senha) {
        return { ok: false, mensagem: "Senha incorreta." };
    }

    const user = { uid: conta.uid, email: emailNorm };
    definirSessao(user);
    return { ok: true };
}

export function sairLocal() {
    definirSessao(null);
}

export function usuarioLocalAtual() {
    return lerSessaoLocal();
}
