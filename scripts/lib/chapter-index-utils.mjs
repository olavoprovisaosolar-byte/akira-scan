/**
 * Utilitários partilhados — caps legíveis no índice cloud + I/O seguro do JSON.
 */
import fs from "node:fs";
import path from "node:path";

export function hasHostedPages(rec) {
    if (!rec?.pages?.length) return false;
    return rec.pages.some((p) => {
        const u = String(p.url || "");
        return u.includes("telegra.ph")
            || u.includes("catbox.moe")
            || u.includes("/api/cloud/page")
            || u.includes("/data/cloud/pages/");
    });
}

/** Cap pronto: done + páginas hospedadas (Telegra ou cloud-static). */
export function capLegivelIndice(rec) {
    return !!(rec?.done && hasHostedPages(rec));
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