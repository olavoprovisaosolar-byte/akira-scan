/**
 * Cliente Terabox — autenticação, retry e tratamento de bloqueio (403).
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { TeraBoxApp } from "terabox-api";
import { unwrapErrorMessage } from "terabox-api/helper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

dotenv.config({ path: path.join(ROOT, ".env") });

export class TeraboxBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = "TeraboxBlockedError";
        this.status = 403;
    }
}

export function extrairNdus() {
    const ndus = process.env.TERABOX_NDUS?.trim();
    if (ndus) return ndus;

    const cookie = process.env.TERABOX_COOKIE?.trim();
    if (!cookie) return null;

    const match = cookie.match(/(?:^|;\s*)ndus=([^;]+)/i);
    return match?.[1] || null;
}

export function lerConfig() {
    return {
        remoteDir: process.env.TERABOX_REMOTE_DIR || "/meus_mangas",
        delayMs: Number(process.env.TERABOX_DELAY_MS || 3000),
        createShares: process.env.TERABOX_CREATE_SHARES === "1",
        recursive: process.env.TERABOX_RECURSIVE === "1"
    };
}

export function isBlockedError(err) {
    const msg = (unwrapErrorMessage(err) || err?.message || "").toLowerCase();
    return (
        err instanceof TeraboxBlockedError ||
        msg.includes("403") ||
        msg.includes("forbidden") ||
        msg.includes("blocked") ||
        msg.includes("errno\":-6") ||
        msg.includes("access denied")
    );
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function withTeraboxRetry(fn, { maxRetries = 3, baseDelayMs = 8000 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (!isBlockedError(err) || attempt === maxRetries) break;
            const wait = baseDelayMs * (attempt + 1);
            console.warn(`[Terabox] Bloqueio 403 — pausa ${Math.round(wait / 1000)}s (tentativa ${attempt + 1}/${maxRetries})`);
            await sleep(wait);
        }
    }
    if (isBlockedError(lastErr)) {
        throw new TeraboxBlockedError(unwrapErrorMessage(lastErr) || "Conta Terabox bloqueada (403). Aguarde e tente mais tarde.");
    }
    throw lastErr;
}

export async function criarCliente() {
    const ndus = extrairNdus();
    if (!ndus) {
        throw new Error("Defina TERABOX_NDUS ou TERABOX_COOKIE no arquivo .env (copie de .env.example).");
    }

    const app = new TeraBoxApp(ndus, "ndus");
    await withTeraboxRetry(() => app.checkLogin());
    await withTeraboxRetry(() => app.updateAppData());
    return app;
}

export async function garantirPasta(client, remoteDir) {
    await withTeraboxRetry(() => client.createDir(remoteDir));
}
