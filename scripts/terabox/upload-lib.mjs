import fs from "fs";
import path from "path";
import { hashFile, uploadChunks, unwrapErrorMessage } from "terabox-api/helper.js";
import { garantirPasta, sleep, withTeraboxRetry } from "./client.mjs";

const PAGE_EXT = /\.(webp|jpg|jpeg|png)$/i;

export function listarPaginasLocais(pagesDir) {
    if (!fs.existsSync(pagesDir)) return [];
    return fs.readdirSync(pagesDir).filter((f) => PAGE_EXT.test(f));
}

export async function uploadArquivo(client, localPath, remoteDir, remoteName) {
    const stat = fs.statSync(localPath);
    if (!stat.isFile()) throw new Error(`Não é arquivo: ${localPath}`);

    const hash = await hashFile(localPath);
    const data = {
        remote_dir: remoteDir,
        file: remoteName || path.basename(localPath),
        size: stat.size,
        hash,
        uploaded: hash.chunks.map(() => false)
    };

    const rapid = await withTeraboxRetry(() => client.rapidUpload(data));
    if (rapid?.errno === 0 || rapid?.info?.length || rapid?.path) {
        return { ok: true, rapid: true, path: `${remoteDir}/${data.file}` };
    }

    const pre = await withTeraboxRetry(() => client.precreateFile({ ...data, upload_id: "" }));
    if (pre.errno && pre.errno !== 0) {
        throw new Error(`precreate falhou (errno ${pre.errno})`);
    }
    data.upload_id = pre.uploadid;

    const chunkResult = await uploadChunks(client, data, localPath);
    if (!chunkResult.ok) {
        throw new Error("Upload de chunks falhou");
    }

    const created = await withTeraboxRetry(() => client.createFile({ ...data, upload_id: data.upload_id }));
    if (created.errno && created.errno !== 0) {
        throw new Error(`create falhou (errno ${created.errno})`);
    }

    return { ok: true, rapid: false, path: `${remoteDir}/${data.file}` };
}

export async function uploadPasta(client, localDir, remoteDir, delayMs, { onFile, concurrency = 4 } = {}) {
    const files = listarPaginasLocais(localDir);
    const resultados = new Array(files.length);
    let next = 0;

    async function worker() {
        while (next < files.length) {
            const idx = next++;
            const f = files[idx];
            const localPath = path.join(localDir, f);
            if (onFile) onFile(f);
            try {
                const r = await uploadArquivo(client, localPath, remoteDir, f);
                resultados[idx] = { file: f, ok: true, ...r };
            } catch (e) {
                resultados[idx] = { file: f, ok: false, erro: unwrapErrorMessage(e) || e.message };
            }
            if (delayMs > 0 && concurrency === 1) await sleep(delayMs);
        }
    }

    const workers = Math.min(Math.max(1, concurrency), files.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    if (delayMs > 0 && concurrency > 1) await sleep(Math.min(delayMs, 500));
    return resultados.filter(Boolean);
}

export function lerTituloManga(mangaDir) {
    const metaPath = path.join(mangaDir, "meta.json");
    if (!fs.existsSync(metaPath)) return null;
    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        return meta.title || meta.titulo || null;
    } catch {
        return null;
    }
}

export function slugSeguro(texto, fallback) {
    const s = String(texto || fallback)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60);
    return s || fallback;
}

export async function garantirEstruturaManga(client, baseDir, mangaId, titulo) {
    const slug = slugSeguro(titulo, mangaId);
    const mangaRemote = `${baseDir}/${slug}__${mangaId}`;
    await garantirPasta(client, baseDir);
    await garantirPasta(client, mangaRemote);
    await garantirPasta(client, `${mangaRemote}/chapters`);
    return mangaRemote;
}

export { unwrapErrorMessage };
