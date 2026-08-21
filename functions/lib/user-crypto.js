/** Crypto para Cloudflare Pages Functions (Web Crypto — PBKDF2). */

const PBKDF2_ITERS = 100000;

function toHex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
    const clean = String(hex || "");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}

export async function hashEmail(email) {
    const data = new TextEncoder().encode(String(email).trim().toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toHex(digest);
}

export async function criarUid(email) {
    const base = (await hashEmail(email)).slice(0, 24);
    return `u_${base}`;
}

async function deriveKey(senha, saltBytes) {
    const baseKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(String(senha)),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    return crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERS, hash: "SHA-256" },
        baseKey,
        256
    );
}

export async function hashSenha(senha) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const bits = await deriveKey(senha, salt);
    return { salt: toHex(salt), hash: toHex(bits), algo: "pbkdf2" };
}

export async function verificarSenha(senha, saltHex, hashHex) {
    if (!senha || !saltHex || !hashHex) return false;
    try {
        const bits = await deriveKey(senha, fromHex(saltHex));
        const atual = toHex(bits);
        if (atual.length !== hashHex.length) return false;
        let diff = 0;
        for (let i = 0; i < atual.length; i++) diff |= atual.charCodeAt(i) ^ hashHex.charCodeAt(i);
        return diff === 0;
    } catch {
        return false;
    }
}

export function criarToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return toHex(bytes);
}

export function expiraSessao(dias = 30) {
    return Date.now() + dias * 24 * 60 * 60 * 1000;
}

/** Username: 3–20 chars, a-z 0-9 _ */
export function normalizarUsername(raw) {
    return String(raw || "").trim().toLowerCase().replace(/^@+/, "");
}

export function validarUsername(raw) {
    const u = normalizarUsername(raw);
    if (u.length < 3 || u.length > 20) {
        return { ok: false, mensagem: "Username: 3 a 20 caracteres." };
    }
    if (!/^[a-z0-9_]+$/.test(u)) {
        return { ok: false, mensagem: "Username: só letras, números e _." };
    }
    return { ok: true, username: u };
}
