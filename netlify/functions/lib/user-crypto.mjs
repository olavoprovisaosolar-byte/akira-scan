import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashEmail(email) {
    return createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
}

export function criarUid(email) {
    const base = hashEmail(email).slice(0, 24);
    return `u_${base}`;
}

export function hashSenha(senha) {
    const salt = randomBytes(16);
    const hash = scryptSync(senha, salt, 64, SCRYPT_OPTS);
    return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

export function verificarSenha(senha, saltHex, hashHex) {
    if (!senha || !saltHex || !hashHex) return false;
    try {
        const salt = Buffer.from(saltHex, "hex");
        const esperado = Buffer.from(hashHex, "hex");
        const atual = scryptSync(senha, salt, 64, SCRYPT_OPTS);
        if (esperado.length !== atual.length) return false;
        return timingSafeEqual(esperado, atual);
    } catch {
        return false;
    }
}

export function criarToken() {
    return randomBytes(32).toString("hex");
}

export function expiraSessao(dias = 30) {
    return Date.now() + dias * 24 * 60 * 60 * 1000;
}
