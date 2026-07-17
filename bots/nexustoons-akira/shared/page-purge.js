/**
 * Purga arquivos locais de capítulos após hosting/upload confirmados.
 *
 * Regras:
 * - telegra / catbox: apaga data/cloud/pages/{mangaId}/{capId}/ logo após upload + checkpoint
 * - cloud-static: mantém até deploy Cloudflare OK (arquivos são a fonte até ir pro CDN)
 * - NEXUSTOONS_PURGE_LOCAL=0 desliga; default ligado em bulk/CI/hyper
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./logger.js";
import { CLOUD_INDEX_PATH } from "./state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
export const STATIC_PAGES_ROOT = path.join(ROOT, "data", "cloud", "pages");

/** @type {Map<string, { mangaId: string, capId: string }>} */
const postDeployQueue = new Map();

function capKey(mangaId, capId) {
    return `${mangaId}/${capId}`;
}

/** @returns {boolean} */
export function isPurgeEnabled() {
    const explicit = String(process.env.NEXUSTOONS_PURGE_LOCAL ?? "").trim().toLowerCase();
    if (explicit === "0" || explicit === "false" || explicit === "no") return false;
    if (explicit === "1" || explicit === "true" || explicit === "yes") return true;
    return process.env.NEXUSTOONS_BULK === "1"
        || process.env.GITHUB_ACTIONS === "true"
        || process.env.CI === "true";
}

export function chapterPagesDir(mangaId, capId) {
    return path.join(STATIC_PAGES_ROOT, mangaId, capId);
}

/** @param {Array<{ url?: string }|string>} pages */
export function pagesUseLocalStatic(pages) {
    return (pages || []).some((p) => {
        const url = typeof p === "string" ? p : p?.url;
        return String(url || "").includes("/data/cloud/pages/");
    });
}

/**
 * Pode apagar imediatamente após upload (URLs remotas; arquivos locais são órfãos).
 * @param {string} hosting
 * @param {Array<{ url?: string, origem?: string }>} pages
 */
export function canPurgeImmediately(hosting, pages) {
    if (!isPurgeEnabled()) return false;
    if (hosting === "telegra" || hosting === "catbox") return true;
    return !pagesUseLocalStatic(pages);
}

/**
 * cloud-static: páginas servidas localmente até deploy — enfileira purge pós-deploy.
 * @param {string} hosting
 * @param {Array<{ url?: string }>} pages
 */
export function needsPostDeployPurge(hosting, pages) {
    if (!isPurgeEnabled()) return false;
    return hosting === "cloud-static" || pagesUseLocalStatic(pages);
}

export function queuePostDeployPurge(mangaId, capId) {
    postDeployQueue.set(capKey(mangaId, capId), { mangaId, capId });
}

export function getPostDeployQueueSize() {
    return postDeployQueue.size;
}

function cleanupEmptyParentDir(dir) {
    const parent = path.dirname(dir);
    try {
        if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) {
            fs.rmdirSync(parent);
        }
    } catch { /* ignore */ }
}

/**
 * @returns {{ purged: boolean, files: number, bytes: number }}
 */
export function purgeChapterPagesDir(mangaId, capId) {
    const dir = chapterPagesDir(mangaId, capId);
    if (!fs.existsSync(dir)) {
        return { purged: false, files: 0, bytes: 0 };
    }

    let files = 0;
    let bytes = 0;
    for (const name of fs.readdirSync(dir)) {
        const fp = path.join(dir, name);
        try {
            const st = fs.statSync(fp);
            if (st.isFile()) {
                files++;
                bytes += st.size;
            }
        } catch { /* ignore */ }
    }

    fs.rmSync(dir, { recursive: true, force: true });
    cleanupEmptyParentDir(dir);

    return { purged: true, files, bytes };
}

function recomputePorManga(caps) {
    const porManga = {};
    for (const rec of Object.values(caps || {})) {
        const mangaId = rec.mangaId;
        if (!porManga[mangaId]) {
            porManga[mangaId] = { totalCaps: 0, doneCaps: 0, legibleCaps: 0, purgedCaps: 0 };
        }
        porManga[mangaId].totalCaps++;
        if (rec.done) porManga[mangaId].doneCaps++;
        if (rec.localPurged) porManga[mangaId].purgedCaps++;
        porManga[mangaId].legibleCaps = porManga[mangaId].doneCaps;
    }
    return porManga;
}

/** Marca localPurged=true no chapters-index.json após purge real. */
export function markLocalPurgedInIndex(mangaId, capId) {
    if (!fs.existsSync(CLOUD_INDEX_PATH)) return false;
    try {
        const idx = JSON.parse(fs.readFileSync(CLOUD_INDEX_PATH, "utf8"));
        const key = capKey(mangaId, capId);
        const rec = idx.caps?.[key];
        if (!rec) return false;
        if (rec.localPurged) return true;
        rec.localPurged = true;
        idx.porManga = recomputePorManga(idx.caps);
        idx.atualizadoEm = new Date().toISOString();
        const tmp = `${CLOUD_INDEX_PATH}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(idx, null, 2), "utf8");
        fs.renameSync(tmp, CLOUD_INDEX_PATH);
        return true;
    } catch (e) {
        log.warn("Falha ao marcar localPurged no índice", { mangaId, capId, err: e.message });
        return false;
    }
}

/**
 * Purga após upload + checkpoint de state.
 * @param {{ mangaId: string, capId: string, hosting: string, pages: Array }} opts
 */
export function purgeAfterUploadSuccess(opts) {
    const { mangaId, capId, hosting, pages } = opts;

    if (!isPurgeEnabled()) {
        return { action: "skip", reason: "NEXUSTOONS_PURGE_LOCAL desligado" };
    }

    if (canPurgeImmediately(hosting, pages)) {
        const result = purgeChapterPagesDir(mangaId, capId);
        if (result.purged) {
            markLocalPurgedInIndex(mangaId, capId);
            log.info("Páginas locais purgadas (host remoto)", {
                mangaId, capId, hosting, files: result.files, bytes: result.bytes
            });
        }
        return { action: "immediate", ...result };
    }

    if (needsPostDeployPurge(hosting, pages)) {
        queuePostDeployPurge(mangaId, capId);
        return { action: "queued", reason: "cloud-static — aguardando deploy Cloudflare" };
    }

    return { action: "skip", reason: "sem arquivos locais para purgar" };
}

/** Purga caps enfileirados na sessão (após deploy OK). */
export function purgePostDeployQueue() {
    if (!isPurgeEnabled()) {
        return { purged: 0, files: 0, bytes: 0, skipped: postDeployQueue.size };
    }

    let purged = 0;
    let totalFiles = 0;
    let totalBytes = 0;

    for (const { mangaId, capId } of postDeployQueue.values()) {
        const result = purgeChapterPagesDir(mangaId, capId);
        if (result.purged) {
            purged++;
            totalFiles += result.files;
            totalBytes += result.bytes;
            markLocalPurgedInIndex(mangaId, capId);
        } else {
            markLocalPurgedInIndex(mangaId, capId);
        }
    }
    postDeployQueue.clear();

    if (purged > 0) {
        log.success("Pós-deploy: caps purgados de data/cloud/pages/", {
            caps: purged, files: totalFiles, bytes: totalBytes
        });
    }

    return { purged, files: totalFiles, bytes: totalBytes };
}

/**
 * Purga todos os caps cloud-static com localPurged=false no índice.
 * Usar SOMENTE após deploy Cloudflare confirmado.
 */
export function purgeAllPendingCloudStatic() {
    if (!isPurgeEnabled()) {
        return { purged: 0, files: 0, bytes: 0 };
    }
    if (!fs.existsSync(CLOUD_INDEX_PATH)) {
        return { purged: 0, files: 0, bytes: 0 };
    }

    const idx = JSON.parse(fs.readFileSync(CLOUD_INDEX_PATH, "utf8"));
    let purged = 0;
    let totalFiles = 0;
    let totalBytes = 0;
    let changed = false;

    for (const rec of Object.values(idx.caps || {})) {
        if (rec.hosting !== "cloud-static") continue;
        if (rec.localPurged) continue;

        const result = purgeChapterPagesDir(rec.mangaId, rec.capId);
        rec.localPurged = true;
        changed = true;

        if (result.purged) {
            purged++;
            totalFiles += result.files;
            totalBytes += result.bytes;
        }
    }

    if (changed) {
        idx.porManga = recomputePorManga(idx.caps);
        idx.atualizadoEm = new Date().toISOString();
        const tmp = `${CLOUD_INDEX_PATH}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(idx, null, 2), "utf8");
        fs.renameSync(tmp, CLOUD_INDEX_PATH);
    }

    if (purged > 0) {
        log.success("Purge cloud-static pendentes concluído", {
            caps: purged, files: totalFiles, bytes: totalBytes
        });
    }

    return { purged, files: totalFiles, bytes: totalBytes };
}

/** Executa purge pós-deploy completo (fila da sessão + pendentes no índice). */
export function runPostDeployPurge() {
    const queueResult = purgePostDeployQueue();
    const indexResult = purgeAllPendingCloudStatic();
    return {
        purged: queueResult.purged + indexResult.purged,
        files: queueResult.files + indexResult.files,
        bytes: queueResult.bytes + indexResult.bytes
    };
}
