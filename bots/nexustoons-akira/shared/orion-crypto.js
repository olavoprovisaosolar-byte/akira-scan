/**
 * Port JS de sync/python/orion_crypto.py — descriptografia OrionCrypto do frontend NexusToons.
 */
import crypto from "node:crypto";

const ORION_SECRET = "OrionNexus2025CryptoKey!Secure";

function initSbox(state) {
    const t = state.key;
    for (let r = 0; r < 256; r++) state.sbox[r] = r;
    let n = 0;
    for (let r = 0; r < 256; r++) {
        n = (n + state.sbox[r] + t[r % t.length]) % 256;
        [state.sbox[r], state.sbox[n]] = [state.sbox[n], state.sbox[r]];
    }
    for (let r = 0; r < 256; r++) state.rsbox[state.sbox[r]] = r;
}

function rotateRight(value, shift) {
    shift %= 8;
    return ((value >> shift) | (value << (8 - shift))) & 0xff;
}

function buildKeys(secret = ORION_SECRET) {
    const hexKeys = [];
    for (let n = 0; n < 5; n++) {
        const raw = `_orion_key_${n}_v2_${secret}`;
        hexKeys.push(crypto.createHash("sha256").update(raw).digest("hex"));
    }
    return hexKeys.map((hexKey) => {
        const key = Buffer.from(hexKey, "hex");
        const state = { key, sbox: new Uint8Array(256), rsbox: new Uint8Array(256) };
        initSbox(state);
        return state;
    });
}

let cachedKeys = null;

function keys() {
    if (!cachedKeys) cachedKeys = buildKeys();
    return cachedKeys;
}

export function isEncryptedResponse(data) {
    return (
        data &&
        typeof data === "object" &&
        typeof data.d === "string" &&
        typeof data.k === "number" &&
        typeof data.v === "number" &&
        (data.v === 1 || data.v === 2)
    );
}

export function decrypt(keyIndex, payload) {
    const ks = keys()[keyIndex];
    if (!ks) throw new Error(`Indice de chave invalido: ${keyIndex}`);
    const { key: r, rsbox: a } = ks;
    const o = Buffer.from(payload, "base64");
    const s = Buffer.alloc(o.length);
    const l = r.length;
    for (let c = o.length - 1; c >= 0; c--) {
        let e = o[c];
        e ^= c > 0 ? o[c - 1] : r[l - 1];
        e = a[e];
        const t = ((r[(c + 3) % l] + (c & 0xff)) & 0xff) % 7 + 1;
        e = rotateRight(e, t);
        e ^= r[c % l];
        s[c] = e;
    }
    return s.toString("utf8");
}

export function processResponse(data) {
    if (!isEncryptedResponse(data)) return data;
    const keyIndex = data.v === 1 ? 0 : (data.k ?? 0);
    try {
        return JSON.parse(decrypt(keyIndex, data.d));
    } catch {
        return data;
    }
}
