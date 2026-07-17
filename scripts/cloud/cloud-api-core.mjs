/**
 * API cloud-chapters — core worker-safe (R2 + índice).
 * Usado por Pages Functions e publish-client do bot.
 */

export const INDEX_KEY = "index/chapters-index.json";

const MIME = {
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    avif: "image/avif"
};

export function corsHeaders(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Akira-Token",
        ...extra
    };
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders({
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": status === 200 ? "public, max-age=60, stale-while-revalidate=120" : "no-store"
        })
    });
}

export function mimeFromExt(ext) {
    return MIME[String(ext || "").toLowerCase().replace("jpeg", "jpg")] || "application/octet-stream";
}

export function pageR2Key(mangaId, capId, pageNum, ext) {
    const n = String(pageNum).padStart(3, "0");
    return `pages/${mangaId}/${capId}/${n}.${String(ext || "jpg").replace("jpeg", "jpg")}`;
}

export function pageApiUrl(origin, mangaId, capId, pageNum) {
    const base = String(origin || "").replace(/\/$/, "");
    const q = new URLSearchParams({
        m: mangaId,
        ch: capId,
        n: String(pageNum)
    });
    return `${base}/api/cloud/page?${q}`;
}

export function chapterStorageKey(mangaId, capId) {
    return `${mangaId}/${capId}`;
}

export function capLegivelRec(rec) {
    if (!rec?.done) return false;
    return !!(rec.pages?.some((p) => {
        const u = String(p.url || "");
        return u.includes("telegra.ph")
            || u.includes("catbox.moe")
            || u.includes("/api/cloud/page")
            || u.includes("/data/cloud/pages/");
    }));
}

export function recomputePorManga(capsObj) {
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
        if (capLegivelRec(rec)) porManga[mangaId].legibleCaps++;
    }
    return porManga;
}

export async function readIndex(bucket) {
    if (!bucket) return { caps: {}, porManga: {}, origem: "r2", total: 0 };
    const obj = await bucket.get(INDEX_KEY);
    if (!obj) return { caps: {}, porManga: {}, origem: "r2", total: 0 };
    const data = await obj.json();
    data.total = data.total || Object.keys(data.caps || {}).length;
    return data;
}

export async function writeIndex(bucket, data) {
    data.atualizadoEm = new Date().toISOString();
    data.origem = data.origem || "r2-api";
    data.total = Object.keys(data.caps || {}).length;
    data.porManga = recomputePorManga(data.caps);
    await bucket.put(INDEX_KEY, JSON.stringify(data), {
        httpMetadata: { contentType: "application/json; charset=utf-8" }
    });
    return data;
}

export function upsertCapInIndex(idx, chapter, meta = {}) {
    const { mangaId, capId, numero, titulo, pages, hosting } = chapter;
    const key = chapterStorageKey(mangaId, capId);
    const usesApiPages = (pages || []).some((p) => String(p.url || "").includes("/api/cloud/page"));

    idx.caps[key] = {
        mangaId,
        capId,
        numero: String(numero),
        titulo: titulo || null,
        tituloManga: meta.title || chapter.mangaTitle || null,
        done: true,
        origem: meta.origem || "nexustoons-bot",
        hosting: hosting || (usesApiPages ? "r2" : chapter.hosting || "telegra"),
        total: pages?.length || 0,
        uploaded: pages?.length || 0,
        localPurged: usesApiPages || !String(hosting || "").includes("cloud-static"),
        pages: (pages || []).map((p, i) => ({
            index: p.index ?? i,
            url: p.url,
            origem: p.origem || (usesApiPages ? "r2-api" : "telegra")
        })),
        hostedAt: chapter.hostedAt || new Date().toISOString(),
        capturedAt: chapter.capturedAt || null,
        sourceUrl: chapter.sourceUrl || meta.sourceUrl || null,
        nexusSlug: meta.nexusSlug || null
    };

    idx.porManga = recomputePorManga(idx.caps);
    idx.total = Object.keys(idx.caps).length;
    return idx;
}

export function paginasApiUrls(origin, mangaId, capId, total) {
    const pages = [];
    for (let i = 0; i < total; i++) {
        pages.push({
            index: i,
            url: pageApiUrl(origin, mangaId, capId, i + 1),
            origem: "r2-api"
        });
    }
    return pages;
}

export function checkPublishAuth(request, env) {
    const token = env?.AKIRA_PUBLISH_TOKEN;
    if (!token) {
        return { ok: false, status: 503, error: "Publish API desabilitada (AKIRA_PUBLISH_TOKEN ausente)." };
    }
    const auth = request.headers.get("Authorization") || "";
    const header = request.headers.get("X-Akira-Token") || "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : header.trim();
    if (!provided || provided !== token) {
        return { ok: false, status: 401, error: "Token de publicação inválido." };
    }
    return { ok: true };
}

export async function findPageObject(bucket, mangaId, capId, pageNum) {
    for (const ext of ["webp", "jpg", "jpeg", "png", "gif", "avif"]) {
        const key = pageR2Key(mangaId, capId, pageNum, ext);
        const obj = await bucket.get(key);
        if (obj) return { obj, ext, key };
    }
    return null;
}

export function apiOriginFromRequest(request, env) {
    const fromEnv = env?.CF_PAGES_URL || env?.URL || env?.DEPLOY_URL || env?.AKIRA_SCAN_BASE_URL;
    if (fromEnv) return String(fromEnv).replace(/\/$/, "");
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
}

export async function handleGetIndex(bucket) {
    const idx = await readIndex(bucket);
    return jsonResponse(idx);
}

export async function handleGetPages(bucket, origin, mangaId, capId) {
    const idx = await readIndex(bucket);
    const info = idx.caps?.[chapterStorageKey(mangaId, capId)];
    if (!info?.done) {
        return jsonResponse({ error: "Capítulo não encontrado." }, 404);
    }

    const apiPages = (info.pages || []).filter((p) => String(p.url || "").includes("/api/cloud/page"));
    if (apiPages.length) {
        return jsonResponse({ mangaId, capId, total: apiPages.length, pages: apiPages });
    }

    const total = info.total || info.uploaded || info.pages?.length || 0;
    if (!total) {
        return jsonResponse({ error: "Capítulo sem páginas." }, 404);
    }

    const pages = paginasApiUrls(origin, mangaId, capId, total);
    return jsonResponse({ mangaId, capId, total: pages.length, pages });
}

export async function handleGetPage(bucket, mangaId, capId, pageNumRaw) {
    const pageNum = Number(pageNumRaw);
    if (!Number.isFinite(pageNum) || pageNum < 1) {
        return jsonResponse({ error: "Parâmetro n inválido." }, 400);
    }

    const found = await findPageObject(bucket, mangaId, capId, pageNum);
    if (!found) {
        return jsonResponse({ error: "Página não encontrada." }, 404);
    }

    return new Response(found.obj.body, {
        status: 200,
        headers: corsHeaders({
            "Content-Type": found.obj.httpMetadata?.contentType || mimeFromExt(found.ext),
            "Cache-Control": "public, max-age=86400, immutable"
        })
    });
}

export async function handlePublish(request, env, origin) {
    const auth = checkPublishAuth(request, env);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const bucket = env.CHAPTERS;
    if (!bucket) {
        return jsonResponse({ error: "R2 CHAPTERS não configurado." }, 503);
    }

    let meta;
    try {
        const form = await request.formData();
        const raw = form.get("metadata");
        if (!raw) return jsonResponse({ error: "Campo metadata obrigatório." }, 400);
        meta = JSON.parse(String(raw));
        const { mangaId, capId, pages: pageMeta } = meta;
        if (!mangaId || !capId || !Array.isArray(pageMeta) || !pageMeta.length) {
            return jsonResponse({ error: "metadata inválido (mangaId, capId, pages)." }, 400);
        }

        const hostedPages = [];
        for (const pm of pageMeta) {
            const index = Number(pm.index ?? hostedPages.length);
            const n = index + 1;
            const ext = String(pm.ext || "jpg").replace("jpeg", "jpg");
            const field = pm.field || `page-${String(n).padStart(3, "0")}`;
            const file = form.get(field);
            if (!file || typeof file.arrayBuffer !== "function") {
                return jsonResponse({ error: `Arquivo ausente: ${field}` }, 400);
            }
            const buf = await file.arrayBuffer();
            if (!buf.byteLength) {
                return jsonResponse({ error: `Arquivo vazio: ${field}` }, 400);
            }
            await bucket.put(pageR2Key(mangaId, capId, n, ext), buf, {
                httpMetadata: { contentType: mimeFromExt(ext) }
            });
            hostedPages.push({
                index,
                url: pageApiUrl(origin, mangaId, capId, n),
                origem: "r2-api"
            });
        }

        const idx = await readIndex(bucket);
        upsertCapInIndex(idx, {
            mangaId,
            capId,
            numero: meta.numero,
            titulo: meta.titulo,
            pages: hostedPages,
            hosting: meta.hosting || "r2",
            hostedAt: new Date().toISOString(),
            capturedAt: meta.capturedAt || null,
            sourceUrl: meta.sourceUrl || null,
            mangaTitle: meta.mangaTitle || null
        }, meta);
        await writeIndex(bucket, idx);

        return jsonResponse({
            ok: true,
            mangaId,
            capId,
            total: hostedPages.length,
            pages: hostedPages
        });
    } catch (e) {
        return jsonResponse({ error: e?.message || "Erro ao publicar capítulo." }, 500);
    }
}

export async function handleIndexChapterPut(request, env) {
    const auth = checkPublishAuth(request, env);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const bucket = env.CHAPTERS;
    if (!bucket) {
        return jsonResponse({ error: "R2 CHAPTERS não configurado." }, 503);
    }

    try {
        const body = await request.json();
        const chapter = body.chapter || body;
        if (!chapter?.mangaId || !chapter?.capId || !Array.isArray(chapter.pages)) {
            return jsonResponse({ error: "chapter inválido." }, 400);
        }
        const idx = await readIndex(bucket);
        upsertCapInIndex(idx, chapter, body.meta || chapter);
        await writeIndex(bucket, idx);
        return jsonResponse({ ok: true, mangaId: chapter.mangaId, capId: chapter.capId });
    } catch (e) {
        return jsonResponse({ error: e?.message || "Erro ao atualizar índice." }, 500);
    }
}

export async function handleStatus(bucket, mangaId, capId) {
    const idx = await readIndex(bucket);
    const info = mangaId && capId ? idx.caps?.[chapterStorageKey(mangaId, capId)] : null;
    return jsonResponse({
        ok: true,
        service: "cloud-chapters",
        platform: "cloudflare-pages",
        storage: "r2",
        hasIndex: Boolean(Object.keys(idx.caps || {}).length),
        total: idx.total || Object.keys(idx.caps || {}).length,
        cap: info ? {
            done: !!info.done,
            hosting: info.hosting || null,
            legivel: capLegivelRec(info),
            purged: !!info.localPurged,
            pages: info.pages?.length || 0
        } : null
    });
}
