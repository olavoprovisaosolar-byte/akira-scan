import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withFileLockSync } from "./file-lock.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
export const STATE_PATH = path.join(ROOT, "data", "nexustoons", "state.json");
export const CLOUD_INDEX_PATH = path.join(ROOT, "data", "cloud", "chapters-index.json");
export const CATALOGO_PATH = path.join(ROOT, "data", "catalogo.json");

const EMPTY = { version: 1, updatedAt: null, processed: {} };

export function chapterStateKey(mangaSlug, capId) {
    return `${mangaSlug}/${capId}`;
}

export function loadState() {
    if (!fs.existsSync(STATE_PATH)) return { ...EMPTY, processed: {} };
    try {
        const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
        return { ...EMPTY, ...raw, processed: raw.processed || {} };
    } catch {
        return { ...EMPTY, processed: {} };
    }
}

/** Escrita atômica: tmp + rename (checkpoint seguro para resume). */
export function saveState(state) {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    state.updatedAt = new Date().toISOString();
    const payload = JSON.stringify(state, null, 2);
    const tmp = `${STATE_PATH}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, payload, "utf8");
    fs.renameSync(tmp, STATE_PATH);
}

/** Persiste state imediatamente após capítulo processado com sucesso. */
export function saveStateImmediate(state) {
    const multiWorker = Math.max(1, Number(process.env.NEXUSTOONS_MANGA_PARALLEL || 1)) > 1;
    if (!multiWorker) {
        saveState(state);
        return;
    }
    withFileLockSync("state", () => {
        const disk = loadState();
        for (const [key, entry] of Object.entries(state.processed || {})) {
            disk.processed[key] = entry;
        }
        saveState(disk);
    });
}

export function isProcessedInState(state, mangaSlug, capId) {
    const key = chapterStateKey(mangaSlug, capId);
    return Boolean(state.processed[key]);
}

export function markProcessed(state, mangaSlug, capId, data) {
    const key = chapterStateKey(mangaSlug, capId);
    state.processed[key] = {
        processedAt: new Date().toISOString(),
        chapterNumber: data.chapterNumber,
        akiraMangaId: data.akiraMangaId,
        akiraCapId: data.akiraCapId || capId,
        nexusChapterId: data.nexusChapterId || null,
        pagesCount: data.pagesCount ?? null
    };
    return state;
}

export function unmarkProcessed(state, mangaSlug, capId) {
    const key = chapterStateKey(mangaSlug, capId);
    delete state.processed[key];
    return state;
}

export function isChapterCompleteInState(state, mangaSlug, capId, expectedPages) {
    const key = chapterStateKey(mangaSlug, capId);
    const entry = state.processed[key];
    if (!entry) return false;
    if (expectedPages != null && entry.pagesCount != null) {
        return Number(entry.pagesCount) === Number(expectedPages);
    }
    return true;
}

function loadCloudIndex() {
    if (!fs.existsSync(CLOUD_INDEX_PATH)) return { caps: {} };
    try {
        return JSON.parse(fs.readFileSync(CLOUD_INDEX_PATH, "utf8"));
    } catch {
        return { caps: {} };
    }
}

function loadCatalogo() {
    if (!fs.existsSync(CATALOGO_PATH)) return { mangas: [] };
    try {
        return JSON.parse(fs.readFileSync(CATALOGO_PATH, "utf8"));
    } catch {
        return { mangas: [] };
    }
}

function envTruthy(name) {
    const v = String(process.env[name] ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}

/** Modo migração Telegra: só pula caps já hospedados em telegra.ph. */
export function wantsTelegraPrimary() {
    const adapter = process.env.HOSTING_ADAPTER
        || process.env.NEXUSTOONS_HOSTING_ADAPTER
        || "telegra";
    return adapter === "telegra" && !envTruthy("TELEGRA_SKIP");
}

function hasTelegraPages(rec) {
    if (rec?.hosting === "telegra") return true;
    return rec?.pages?.some((p) => String(p.url || "").includes("telegra.ph"));
}

function hasHostedPages(rec) {
    return rec?.pages?.some((p) => {
        const u = String(p.url || "");
        return u.includes("telegra.ph")
            || u.includes("catbox.moe")
            || u.includes("/api/cloud/page")
            || u.includes("/data/cloud/pages/");
    });
}

function hasPublishablePages(rec) {
    if (wantsTelegraPrimary()) return hasTelegraPages(rec);
    return hasHostedPages(rec);
}

function isTelegraCatalogCap(cap) {
    return cap?.hosting === "telegra" || cap?.origem === "nexustoons";
}

function isInCloudIndex(idx, akiraMangaId, capId, chapterNumber) {
    const cloudKey = `${akiraMangaId}/${capId}`;
    const byKey = idx.caps?.[cloudKey];
    if (byKey?.done && hasPublishablePages(byKey)) {
        return { source: "cloud-index", key: cloudKey, rec: byKey };
    }

    for (const [key, rec] of Object.entries(idx.caps || {})) {
        if (rec.mangaId !== akiraMangaId || !rec.done || !hasPublishablePages(rec)) continue;
        if (String(rec.numero) === String(chapterNumber)) {
            return { source: "cloud-index", key, rec };
        }
    }
    return null;
}

function isInCatalogo(catalogo, akiraMangaId, chapterNumber) {
    const manga = catalogo.mangas?.find((m) => m.id === akiraMangaId);
    if (!manga?.capitulos?.length) return null;

    const cap = manga.capitulos.find(
        (c) => String(c.numero) === String(chapterNumber) && isTelegraCatalogCap(c)
    );
    if (!cap) return null;
    return { source: "catalogo", capId: cap.id };
}

/**
 * Verifica state.json, índice cloud e (opcionalmente) catalogo.json.
 * @returns {{ skip: boolean, reason?: string, source?: string }}
 */
export function getChapterSkipReason(state, mangaSlug, capId, akiraMangaId, chapterNumber, expectedPages = null) {
    const telegraMode = wantsTelegraPrimary();
    const idx = loadCloudIndex();
    const cloudHit = isInCloudIndex(idx, akiraMangaId, capId, chapterNumber);

    if (cloudHit) {
        const rec = cloudHit.rec;
        if (expectedPages != null && rec?.total != null && Number(rec.total) !== Number(expectedPages)) {
            return { skip: false, reason: "page-count-mismatch" };
        }
        return { skip: true, reason: cloudHit.key, source: cloudHit.source };
    }

    const key = chapterStateKey(mangaSlug, capId);
    const stateEntry = state.processed[key];
    if (stateEntry && !telegraMode) {
        if (expectedPages != null && stateEntry.pagesCount != null) {
            if (Number(stateEntry.pagesCount) === Number(expectedPages)) {
                return { skip: true, reason: "state.json", source: "state" };
            }
        } else {
            return { skip: true, reason: "state.json", source: "state" };
        }
    }

    if (!telegraMode) {
        const catalogo = loadCatalogo();
        const catalogHit = isInCatalogo(catalogo, akiraMangaId, chapterNumber);
        if (catalogHit) {
            return { skip: true, reason: catalogHit.capId, source: catalogHit.source };
        }
    }

    return { skip: false };
}

/** Remove cap parcial de índice, catálogo e state após falha de upload. */
export function rollbackChapterPublication({
    mangaSlug,
    capId,
    akiraMangaId,
    chapterNumber
}) {
    const snapshots = {};

    if (fs.existsSync(CLOUD_INDEX_PATH)) {
        snapshots.cloud = fs.readFileSync(CLOUD_INDEX_PATH, "utf8");
    }
    if (fs.existsSync(CATALOGO_PATH)) {
        snapshots.catalog = fs.readFileSync(CATALOGO_PATH, "utf8");
    }
    if (fs.existsSync(STATE_PATH)) {
        snapshots.state = fs.readFileSync(STATE_PATH, "utf8");
    }

    try {
        if (snapshots.cloud) {
            const idx = JSON.parse(snapshots.cloud);
            const key = `${akiraMangaId}/${capId}`;
            delete idx.caps[key];
            idx.porManga = recomputePorManga(idx.caps);
            idx.atualizadoEm = new Date().toISOString();
            guardarJsonAtomic(CLOUD_INDEX_PATH, idx);
        }

        if (snapshots.catalog) {
            const catalogo = JSON.parse(snapshots.catalog);
            const manga = catalogo.mangas?.find((m) => m.id === akiraMangaId);
            if (manga?.capitulos) {
                manga.capitulos = manga.capitulos.filter((c) => c.id !== capId);
                manga.totalCapitulos = manga.capitulos.length;
                catalogo.atualizadoEm = new Date().toISOString();
                guardarJsonAtomic(CATALOGO_PATH, catalogo);
            }
        }

        if (snapshots.state) {
            const st = JSON.parse(snapshots.state);
            unmarkProcessed(st, mangaSlug, capId);
            saveState(st);
        }
    } catch {
        if (snapshots.cloud) fs.writeFileSync(CLOUD_INDEX_PATH, snapshots.cloud, "utf8");
        if (snapshots.catalog) fs.writeFileSync(CATALOGO_PATH, snapshots.catalog, "utf8");
        if (snapshots.state) fs.writeFileSync(STATE_PATH, snapshots.state, "utf8");
        throw new Error(`Rollback falhou para cap ${chapterNumber} (${capId})`);
    }

    return { ok: true, capId, chapterNumber };
}

function recomputePorManga(capsObj) {
    const porManga = {};
    for (const rec of Object.values(capsObj || {})) {
        const mangaId = rec.mangaId;
        if (!mangaId) continue;
        if (!porManga[mangaId]) {
            porManga[mangaId] = { totalCaps: 0, doneCaps: 0, legibleCaps: 0, purgedCaps: 0 };
        }
        porManga[mangaId].totalCaps++;
        if (rec.done) porManga[mangaId].doneCaps++;
        if (rec.localPurged) porManga[mangaId].purgedCaps++;
        if (hasPublishablePages(rec)) porManga[mangaId].legibleCaps++;
    }
    return porManga;
}

function guardarJsonAtomic(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
}

/** Verifica state.json OU índice cloud Akira Scan OU catalogo (Telegra). */
export function isChapterAlreadyPublished(state, mangaSlug, capId, akiraMangaId, chapterNumber) {
    return getChapterSkipReason(state, mangaSlug, capId, akiraMangaId, chapterNumber).skip;
}

/** Capítulos marcados em state.json para um slug NexusToons. */
export function countProcessedForSlug(state, slug) {
    const prefix = `${slug}/`;
    return Object.keys(state.processed || {}).filter((k) => k.startsWith(prefix)).length;
}

/** Mangá considerado completo quando todos os caps Nexus constam no state (ou Telegra no índice). */
export function isMangaFullyInState(state, slug, totalChapters, akiraMangaId = null) {
    const total = Number(totalChapters);
    if (!slug || !Number.isFinite(total) || total <= 0) return false;

    if (wantsTelegraPrimary() && akiraMangaId) {
        const idx = loadCloudIndex();
        let telegraCaps = 0;
        for (const rec of Object.values(idx.caps || {})) {
            if (rec.mangaId !== akiraMangaId || !rec.done || !hasTelegraPages(rec)) continue;
            telegraCaps++;
        }
        return telegraCaps >= total;
    }

    return countProcessedForSlug(state, slug) >= total;
}
