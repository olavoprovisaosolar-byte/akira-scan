/**
 * Utilitários partilhados — caps legíveis no índice cloud + I/O seguro do JSON.
 */
import fs from "node:fs";
import path from "node:path";

/** URL de página servível pelo leitor (CDN direto ou proxy Pages). */
export function isServablePageUrl(url) {
    const u = String(url || "");
    return u.includes("telegra.ph")
        || u.includes("catbox.moe")
        || u.includes("files.catbox.moe")
        || u.includes("litter.catbox.moe")
        || u.includes("pixeldrain.com")
        || u.includes("iili.io")
        || u.includes("freeimage.host")
        || u.includes("i.ibb.co")
        || u.includes("ibb.co")
        || u.includes("/api/cloud/page")
        || u.includes("/api/discord-img")
        || u.includes("/api/gh-cdn/")
        || u.includes("/data/cloud/pages/");
}

export function hasHostedPages(rec) {
    if (!rec?.pages?.length) return false;
    return rec.pages.some((p) => isServablePageUrl(p.url));
}

/** Cap pronto: done + páginas hospedadas (Telegra ou cloud-static). */
export function capLegivelIndice(rec) {
    return !!(rec?.done && hasHostedPages(rec));
}

function recTime(rec) {
    const raw = rec?.hostedAt || rec?.capturedAt || rec?.atualizadoEm || 0;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
}

/**
 * Escolhe o melhor registo entre local e live ao mesclar índices.
 * Empate → local (evita CDN antigo sobrescrever git restaurado).
 */
export function pickBetterCap(localRec, liveRec) {
    if (!localRec) return liveRec;
    if (!liveRec) return localRec;
    const localPages = localRec?.pages?.length || 0;
    const livePages = liveRec?.pages?.length || 0;
    if (livePages !== localPages) return livePages > localPages ? liveRec : localRec;
    const localTs = recTime(localRec);
    const liveTs = recTime(liveRec);
    if (liveTs !== localTs) return liveTs > localTs ? liveRec : localRec;
    return localRec;
}

export function legibleCapIdsForManga(cloudIndex, mangaId) {
    const ids = new Set();
    for (const rec of Object.values(cloudIndex?.caps || {})) {
        if (rec.mangaId !== mangaId || !capLegivelIndice(rec)) continue;
        if (rec.capId) ids.add(rec.capId);
    }
    return ids;
}

export function legibleCapsForManga(cloudIndex, mangaId) {
    const byNum = new Map();
    for (const rec of Object.values(cloudIndex?.caps || {})) {
        if (rec.mangaId !== mangaId || !capLegivelIndice(rec)) continue;
        const num = Number(rec.numero);
        if (!Number.isFinite(num) || num <= 0) continue;
        byNum.set(num, rec);
    }
    return byNum;
}

const READ_RETRIES = 5;
const READ_RETRY_MS = 120;

function sleepSync(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        /* aguarda lock de ficheiro */
    }
}

/** Leitura JSON com retries (Windows lock / errno -4094). */
export function readJsonFile(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    let lastErr;
    for (let i = 0; i < READ_RETRIES; i++) {
        try {
            return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch (err) {
            lastErr = err;
            if (i < READ_RETRIES - 1) sleepSync(READ_RETRY_MS);
        }
    }
    throw lastErr;
}

/** Escrita atómica (tmp + rename), como akira-scan-api.js guardarJson. */
export function writeJsonAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
        fs.renameSync(tmp, file);
    } catch (err) {
        try {
            if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        } catch {
            /* ignore */
        }
        throw err;
    }
}