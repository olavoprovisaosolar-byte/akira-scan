/**
 * Upload Akira Scan — catálogo + índice cloud com URLs Catbox (modo gratuito).
 * Escrita transacional: só persiste após 100% das páginas validadas.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../shared/config.js";
import { log } from "../shared/logger.js";
import { validateHostedChapter, chapterKey } from "../shared/schema.js";
import { akiraMangaId, akiraCapId } from "../shared/ids.js";
import { withFileLockSync } from "../shared/file-lock.mjs";
import { pagesUseLocalStatic } from "../shared/page-purge.js";
import {
    publishApiEnabled,
    publishApiBaseUrl,
    syncChapterIndex
} from "../../../scripts/cloud/publish-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const CLOUD_INDEX = path.join(ROOT, "data", "cloud", "chapters-index.json");
const MANIFEST_PATH = path.join(ROOT, "data", "nexustoons", "manifest.json");
const cfg = loadConfig();

function envTruthy(name) {
    const v = String(process.env[name] ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}

const DEFER_CATALOG = envTruthy("NEXUSTOONS_DEFER_CATALOG");
let deferredIdx = null;
let deferredCatalogo = null;
let deferredManifest = null;
let deferredPending = 0;

function resolveDefaultHosting(explicit) {
    return explicit
        || process.env.HOSTING_ADAPTER
        || process.env.NEXUSTOONS_HOSTING_ADAPTER
        || "catbox";
}

function inferPageOrigem(url, fallback) {
    const u = String(url || "");
    if (u.includes("catbox.moe")) return "catbox";
    if (u.includes("telegra.ph")) return "telegra";
    if (u.includes("/api/cloud/page")) return "r2";
    if (u.includes("/data/cloud/pages/")) return "cloud-static";
    return fallback || resolveDefaultHosting();
}

function ensureDeferredLoaded() {
    if (deferredIdx) return;
    deferredIdx = lerJson(CLOUD_INDEX, { caps: {}, porManga: {}, origem: "cloud-index" });
    deferredCatalogo = lerJson(CATALOGO, { mangas: [] });
    deferredManifest = fs.existsSync(MANIFEST_PATH) ? lerJson(MANIFEST_PATH, null) : null;
}

function lerJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function guardarJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
}

function snapshotFiles(files) {
    const snap = {};
    for (const f of files) {
        if (fs.existsSync(f)) snap[f] = fs.readFileSync(f, "utf8");
    }
    return snap;
}

function restoreSnapshots(snap) {
    for (const [file, content] of Object.entries(snap)) {
        fs.writeFileSync(file, content, "utf8");
    }
}

function capLegivelIndice(rec) {
    if (!rec?.done) return false;
    return !!(rec.pages?.some((p) => {
        const u = String(p.url || "");
        return u.includes("telegra.ph")
            || u.includes("catbox.moe")
            || u.includes("/api/cloud/page")
            || u.includes("/data/cloud/pages/");
    }));
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
        if (capLegivelIndice(rec)) porManga[mangaId].legibleCaps++;
    }
    return porManga;
}

/**
 * Converte payload estruturado para HostedChapter interno.
 */
export function fromStructuredPayload(payload, meta = {}) {
    const nexusSlug = meta.nexusSlug || payload.nexusSlug || null;
    const mangaId = payload.mangaId || meta.akiraMangaId || akiraMangaId(nexusSlug, meta.akiraId);
    const numero = payload.chapter_number;
    const capId = payload.capId || akiraCapId(mangaId, numero);

    const hosting = resolveDefaultHosting(payload.hosting);

    return {
        mangaId,
        capId,
        numero: Number(numero),
        titulo: payload.chapter_title || `Capítulo ${numero}`,
        pages: (payload.pages || []).map((url, index) => ({
            index,
            url: String(url),
            origem: inferPageOrigem(url, hosting)
        })),
        hosting,
        hostedAt: new Date().toISOString(),
        sourceUrl: payload.source_url || null,
        mangaTitle: payload.manga_title || meta.title || null
    };
}

function mergeCatalogoCap(catalogo, mangaId, capId, numero, tituloCap, mangaTitle) {
    let manga = catalogo.mangas?.find((m) => m.id === mangaId);
    if (!manga && mangaTitle) {
        manga = {
            id: mangaId,
            titulo: mangaTitle,
            capitulos: [],
            totalCapitulos: 0,
            origem: "nexustoons"
        };
        catalogo.mangas = catalogo.mangas || [];
        catalogo.mangas.push(manga);
    }
    if (!manga) return catalogo;

    const caps = manga.capitulos || [];
    const existing = caps.find((c) => c.id === capId);
    if (!existing) {
        caps.push({
            id: capId,
            numero: Number(numero),
            titulo: tituloCap || null,
            publicadoEm: new Date().toISOString(),
            novo: true,
            origem: "nexustoons",
            hosting: resolveDefaultHosting()
        });
    }
    caps.sort((a, b) => Number(b.numero) - Number(a.numero));
    manga.capitulos = caps;
    manga.totalCapitulos = caps.length;
    manga.atualizadoEm = new Date().toISOString();
    catalogo.atualizadoEm = new Date().toISOString();
    return catalogo;
}

function upsertCloudIndex(idx, chapter, meta = {}) {
    const { mangaId, capId, numero, titulo, pages } = chapter;
    const key = chapterKey(mangaId, capId);

    idx.caps[key] = {
        mangaId,
        capId,
        numero: String(numero),
        titulo: titulo || null,
        tituloManga: meta.title || chapter.mangaTitle || null,
        done: true,
        origem: "nexustoons-bot",
        hosting: chapter.hosting || resolveDefaultHosting(),
        total: pages.length,
        uploaded: pages.length,
        localPurged: !pagesUseLocalStatic(pages) || pages.some((p) => String(p.url || "").includes("/api/cloud/page")),
        pages: pages.map((p, i) => ({
            index: p.index ?? i,
            url: p.url,
            origem: p.origem || inferPageOrigem(p.url, chapter.hosting)
        })),
        hostedAt: chapter.hostedAt || new Date().toISOString(),
        capturedAt: chapter.capturedAt || null,
        sourceUrl: chapter.sourceUrl || meta.sourceUrl || null,
        nexusSlug: meta.nexusSlug || null
    };

    idx.atualizadoEm = new Date().toISOString();
    idx.origem = "nexustoons-bot";
    idx.porManga = recomputePorManga(idx.caps);
    return idx;
}

function touchManifestMeta(manifest, mangaId, capId, pagesCount, hosting) {
    if (!manifest) return manifest;
    for (const entry of Object.values(manifest.mangas || {})) {
        if (entry.akiraId !== mangaId) continue;
        for (const ch of Object.values(entry.chapters || {})) {
            if (ch.capId === capId) {
                ch.hosting = hosting || resolveDefaultHosting();
                ch.pages = pagesCount;
            }
        }
    }
    manifest.updatedAt = new Date().toISOString();
    return manifest;
}

/**
 * Sincroniza metadados do capítulo com índice remoto (GitHub API ou R2).
 */
async function syncRemoteIndex(chapter, meta = {}) {
    if (!publishApiEnabled()) return { ok: true, skipped: true };
    const usesApiPages = chapter.pages?.some((p) => String(p.url || "").includes("/api/cloud/page"));
    if (usesApiPages) return { ok: true, skipped: true, reason: "pages already published via API" };

    const baseUrl = publishApiBaseUrl(cfg.akiraScanBaseUrl);
    const token = process.env.AKIRA_PUBLISH_TOKEN;
    await syncChapterIndex({ baseUrl, token, chapter, meta });
    return { ok: true };
}

/**
 * Grava índice + catálogo + manifest + state numa única transação.
 * Restaura snapshots se qualquer passo falhar.
 */
function publishChapterTransactional(chapter, meta = {}) {
    const { mangaId, capId, numero, titulo, pages } = chapter;

    const files = [CLOUD_INDEX, CATALOGO, MANIFEST_PATH].filter((f) => fs.existsSync(f));
    const snap = snapshotFiles(files);

    try {
        const idx = lerJson(CLOUD_INDEX, { caps: {}, porManga: {}, origem: "cloud-index" });
        upsertCloudIndex(idx, chapter, meta);
        guardarJson(CLOUD_INDEX, idx);

        let catalogo = lerJson(CATALOGO, { mangas: [] });
        catalogo = mergeCatalogoCap(
            catalogo,
            mangaId,
            capId,
            numero,
            titulo,
            chapter.mangaTitle || meta.title
        );
        guardarJson(CATALOGO, catalogo);

        let manifest = lerJson(MANIFEST_PATH, null);
        if (manifest) {
            manifest = touchManifestMeta(manifest, mangaId, capId, pages.length, chapter.hosting);
            guardarJson(MANIFEST_PATH, manifest);
        }

        log.info("Índice cloud + catálogo atualizados (transacional)", { key: `${mangaId}/${capId}`, pages: pages.length });
        return { ok: true, chapter, idxEntry: idx.caps[`${mangaId}/${capId}`] };
    } catch (e) {
        restoreSnapshots(snap);
        throw e;
    }
}

function flushDeferredCatalog() {
    if (!DEFER_CATALOG || deferredPending === 0) return { ok: true, flushed: 0 };

    const multiWorker = Math.max(1, Number(process.env.NEXUSTOONS_MANGA_PARALLEL || 1)) > 1;

    const doFlush = () => {
        const count = deferredPending;
        const snap = snapshotFiles([CLOUD_INDEX, CATALOGO, MANIFEST_PATH].filter((f) => fs.existsSync(f)));

        try {
            let idx = lerJson(CLOUD_INDEX, { caps: {}, porManga: {}, origem: "cloud-index" });
            let catalogo = lerJson(CATALOGO, { mangas: [] });
            let manifest = fs.existsSync(MANIFEST_PATH) ? lerJson(MANIFEST_PATH, null) : null;

            if (multiWorker) {
                for (const [key, rec] of Object.entries(deferredIdx?.caps || {})) {
                    idx.caps[key] = rec;
                }
                idx.porManga = recomputePorManga(idx.caps);
                idx.atualizadoEm = new Date().toISOString();

                for (const manga of deferredCatalogo?.mangas || []) {
                    let target = catalogo.mangas?.find((m) => m.id === manga.id);
                    if (!target) {
                        catalogo.mangas = catalogo.mangas || [];
                        catalogo.mangas.push(manga);
                    } else {
                        for (const cap of manga.capitulos || []) {
                            catalogo = mergeCatalogoCap(
                                catalogo, manga.id, cap.id, cap.numero, cap.titulo, manga.titulo
                            );
                        }
                    }
                }
            } else {
                idx = deferredIdx;
                catalogo = deferredCatalogo;
                manifest = deferredManifest;
            }

            guardarJson(CLOUD_INDEX, idx);
            guardarJson(CATALOGO, catalogo);
            if (manifest) guardarJson(MANIFEST_PATH, manifest);
            log.info("Catálogo + índice gravados em lote (defer)", { chapters: count, merged: multiWorker });
            deferredPending = 0;
            deferredIdx = null;
            deferredCatalogo = null;
            deferredManifest = null;
            return { ok: true, flushed: count };
        } catch (e) {
            restoreSnapshots(snap);
            throw e;
        }
    };

    if (multiWorker) {
        return withFileLockSync("catalog", doFlush);
    }
    return doFlush();
}

/** @type {import('./adapter.js').UploadAdapter} */
export function createAdapter() {
    return {
        name: "akira-scan",

        flushDeferredCatalog,

        async uploadChapter(chapterOrPayload, meta = {}) {
            const chapter = chapterOrPayload.manga_title
                ? fromStructuredPayload(chapterOrPayload, meta)
                : chapterOrPayload;

            const errors = validateHostedChapter(chapter);
            if (errors.length) {
                const errMsg = errors.join("; ");
                log.error(`Resposta da API da Akira Scan: validação falhou — ${errMsg}`, {
                    mangaId: chapter.mangaId,
                    capId: chapter.capId
                });
                return {
                    ok: false,
                    mangaId: chapter.mangaId,
                    capId: chapter.capId,
                    pagesSaved: 0,
                    error: errMsg
                };
            }

            const { mangaId, capId, numero, pages } = chapter;

            const structured = chapterOrPayload.manga_title
                ? chapterOrPayload
                : toStructuredPayload(chapter, meta);

            log.tag("AKIRA API", "Enviando JSON com links finais para a API...", {
                mangaId,
                capId,
                chapter: String(numero),
                pages: pages.length
            });

            try {
                if (DEFER_CATALOG) {
                    ensureDeferredLoaded();
                    upsertCloudIndex(deferredIdx, chapter, meta);
                    deferredCatalogo = mergeCatalogoCap(
                        deferredCatalogo,
                        mangaId,
                        capId,
                        numero,
                        chapter.titulo,
                        chapter.mangaTitle || meta.title
                    );
                    if (deferredManifest) {
                        deferredManifest = touchManifestMeta(deferredManifest, mangaId, capId, pages.length, chapter.hosting);
                    }
                    deferredPending++;
                } else {
                    const pub = publishChapterTransactional(chapter, meta);
                    try {
                        await syncRemoteIndex(
                            { ...chapter, pages: pub.idxEntry?.pages || chapter.pages, hosting: chapter.hosting },
                            meta
                        );
                    } catch (e) {
                        log.warn("Sync índice remoto falhou (local OK)", { err: e.message, mangaId, capId });
                    }
                }
            } catch (e) {
                log.error(`Resposta da API da Akira Scan: falha ao gravar índice — ${e.message}`, {
                    mangaId,
                    capId
                });
                return {
                    ok: false,
                    mangaId,
                    capId,
                    pagesSaved: 0,
                    error: e.message
                };
            }

            log.success(
                `Resposta da API da Akira Scan: ok — capítulo ${numero} publicado (${pages.length} páginas)`,
                { mangaId, capId, baseUrl: cfg.akiraScanBaseUrl }
            );

            return { ok: true, mangaId, capId, pagesSaved: pages.length, payload: structured };
        },

        async uploadBatch(chapters, meta) {
            const results = [];
            for (const ch of chapters) {
                results.push(await this.uploadChapter(ch, meta));
            }
            return results;
        },

        async finalize() {
            if (DEFER_CATALOG) flushDeferredCatalog();

            const script = path.join(ROOT, "scripts", "build-catalog-index.mjs");
            if (!fs.existsSync(script)) {
                log.warn("build-catalog-index.mjs não encontrado — syncProntos pode ficar desatualizado");
                return;
            }
            log.info("Reconstruindo catalogo-index...");
            const { spawnSync } = await import("node:child_process");
            const r = spawnSync(process.execPath, [script], { cwd: ROOT, stdio: "inherit" });
            if (r.status !== 0) log.warn("build-catalog-index terminou com código", { code: r.status });
        }
    };
}

export function toStructuredPayload(chapter, meta = {}) {
    return {
        manga_title: meta.title || chapter.mangaTitle || "",
        chapter_number: String(chapter.numero),
        chapter_title: chapter.titulo || "",
        source_url: meta.sourceUrl || chapter.sourceUrl || "",
        pages: chapter.pages.map((p) => p.url)
    };
}
