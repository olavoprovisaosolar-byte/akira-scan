/**
 * Cliente HTTP para publicar capítulos na API Cloudflare (R2).
 */
import fs from "node:fs";

export function publishApiEnabled() {
    const token = String(process.env.AKIRA_PUBLISH_TOKEN || "").trim();
    if (!token) return false;
    const off = String(process.env.AKIRA_PUBLISH_API || "").trim().toLowerCase();
    return off !== "0" && off !== "false" && off !== "no";
}

export function publishApiBaseUrl(fallback) {
    return String(
        process.env.AKIRA_PUBLISH_BASE_URL
        || process.env.AKIRA_SCAN_BASE_URL
        || fallback
        || ""
    ).replace(/\/$/, "");
}

function authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
}

/**
 * Publica capítulo com imagens (multipart) → R2 + índice.
 * @param {{ baseUrl: string, token: string, chapter: object, pageFiles: Array<{ index: number, ext: string, buffer: Buffer, filename?: string, field?: string }> }} opts
 */
export async function publishChapterPages(opts) {
    const { baseUrl, token, chapter, pageFiles } = opts;
    if (!baseUrl || !token) {
        throw new Error("AKIRA_PUBLISH_BASE_URL e AKIRA_PUBLISH_TOKEN são obrigatórios.");
    }

    const form = new FormData();
    const pageMeta = pageFiles.map((pf, i) => {
        const index = pf.index ?? i;
        const n = index + 1;
        const field = pf.field || `page-${String(n).padStart(3, "0")}`;
        return { index, ext: pf.ext || "jpg", field };
    });

    form.append("metadata", JSON.stringify({
        mangaId: chapter.mangaId,
        capId: chapter.capId,
        numero: chapter.numero,
        titulo: chapter.titulo,
        hosting: chapter.hosting || "r2",
        mangaTitle: chapter.mangaTitle || null,
        sourceUrl: chapter.sourceUrl || null,
        capturedAt: chapter.capturedAt || null,
        nexusSlug: chapter.nexusSlug || null,
        origem: "nexustoons-bot",
        pages: pageMeta
    }));

    for (let i = 0; i < pageFiles.length; i++) {
        const pf = pageFiles[i];
        const index = pf.index ?? i;
        const field = pf.field || `page-${String(index + 1).padStart(3, "0")}`;
        const ext = pf.ext || "jpg";
        const filename = pf.filename || `${field}.${ext}`;
        const blob = new Blob([pf.buffer], { type: pf.contentType || `image/${ext === "jpg" ? "jpeg" : ext}` });
        form.append(field, blob, filename);
    }

    const res = await fetch(`${baseUrl}/api/cloud/publish`, {
        method: "POST",
        headers: authHeaders(token),
        body: form
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `Publish API HTTP ${res.status}`);
    }
    return data;
}

/** Sincroniza metadados do capítulo no índice R2 (Telegra/catbox sem arquivos). */
export async function syncChapterIndex(opts) {
    const { baseUrl, token, chapter, meta = {} } = opts;
    const res = await fetch(`${baseUrl}/api/cloud/index/chapter`, {
        method: "PUT",
        headers: {
            ...authHeaders(token),
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ chapter, meta })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error || `Index sync HTTP ${res.status}`);
    }
    return data;
}

/** Lê arquivos locais de data/cloud/pages e republica via API (migração). */
export async function publishLocalChapterDir({ baseUrl, token, mangaId, capId, chapterMeta = {} }) {
    const dir = chapterMeta.dir;
    if (!dir || !fs.existsSync(dir)) {
        throw new Error(`Diretório local ausente: ${dir}`);
    }
    const files = fs.readdirSync(dir)
        .filter((f) => /\.(webp|jpe?g|png|gif|avif)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const pageFiles = files.map((filename, i) => {
        const m = filename.match(/(\d+)\.(webp|jpe?g|png|gif|avif)$/i);
        const index = m ? Number(m[1]) - 1 : i;
        const ext = (m?.[2] || "jpg").replace("jpeg", "jpg");
        return {
            index,
            ext,
            buffer: fs.readFileSync(`${dir}/${filename}`),
            filename
        };
    });

    return publishChapterPages({
        baseUrl,
        token,
        chapter: {
            mangaId,
            capId,
            numero: chapterMeta.numero,
            titulo: chapterMeta.titulo,
            hosting: "r2",
            ...chapterMeta
        },
        pageFiles
    });
}
