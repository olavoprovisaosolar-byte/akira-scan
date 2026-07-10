/**
 * Resolve capítulos remotos — gera links estáveis via API (dlinks frescos no servidor).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_EXT = /\.(webp|jpg|jpeg|png)$/i;

const pathCache = new Map();
const PATH_CACHE_MS = 3600000;

function resolveRoot() {
    const candidates = [
        process.cwd(),
        path.join(__dirname, "..", ".."),
        path.join("/var/task"),
        path.join("/var/task/repository")
    ];
    for (const root of candidates) {
        if (fs.existsSync(path.join(root, "data", "cloud", "chapters-index.json"))) return root;
        if (fs.existsSync(path.join(root, "data", "terabox", "chapters-index.json"))) return root;
    }
    return path.join(__dirname, "..", "..");
}

const ROOT = resolveRoot();

function lerIndice() {
    for (const rel of ["data/cloud/chapters-index.json", "data/terabox/chapters-index.json"]) {
        const p = path.join(ROOT, rel);
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, "utf8"));
        }
    }
    return { caps: {} };
}

export function capInfo(mangaId, capId) {
    const idx = lerIndice();
    return idx.caps?.[`${mangaId}/${capId}`] || null;
}

function ordenarPaginas(files) {
    return [...files].sort((a, b) => {
        const na = Number(String(a).match(/(\d+)/)?.[1] || 0);
        const nb = Number(String(b).match(/(\d+)/)?.[1] || 0);
        return na - nb || String(a).localeCompare(String(b));
    });
}

async function getClient() {
    const { criarCliente } = await import("../terabox/client.mjs");
    return criarCliente();
}

async function listarPathsRemotos(remoteDir) {
    const cached = pathCache.get(remoteDir);
    if (cached && Date.now() - cached.ts < PATH_CACHE_MS) {
        return cached.paths;
    }

    const client = await getClient();
    const res = await client.getRemoteDir(remoteDir);
    if (res.errno && res.errno !== 0) return [];

    const entries = res.list || res.info || res.entries || [];
    const paths = ordenarPaginas(
        entries
            .filter((e) => !(e.isdir === 1 || e.isdir === true))
            .map((e) => e.path || `${remoteDir}/${e.server_filename}`)
            .filter((p) => PAGE_EXT.test(p))
    );

    pathCache.set(remoteDir, { paths, ts: Date.now() });
    return paths;
}

async function dlinkParaPath(client, filePath) {
    const meta = await client.getFileMeta([filePath]);
    const items = meta?.info || meta?.list || [];
    const item = items[0];
    return item?.dlink || item?.dlink_url || null;
}

/** Lista páginas com URLs estáveis da nossa API (não expiram no cliente). */
export async function paginasComUrlsEstaveis(mangaId, capId, apiOrigin) {
    const info = capInfo(mangaId, capId);
    if (!info?.done || !info.remote) {
        throw new Error("Capítulo não disponível no armazenamento remoto.");
    }

    const paths = info.pagePaths?.length
        ? info.pagePaths
        : await listarPathsRemotos(info.remote);

    if (!paths.length) throw new Error("Capítulo sem páginas remotas.");

    const base = apiOrigin.replace(/\/$/, "");
    const q = (n) => `m=${encodeURIComponent(mangaId)}&ch=${encodeURIComponent(capId)}&n=${n}`;

    return paths.map((_, i) => ({
        index: i,
        url: `${base}/api/cloud/page?${q(i + 1)}`,
        origem: "remoto"
    }));
}

/** Busca bytes da página N (dlink gerado na hora no servidor). */
export async function buscarPaginaRemota(mangaId, capId, numeroPagina) {
    const info = capInfo(mangaId, capId);
    if (!info?.done || !info.remote) {
        throw new Error("Capítulo indisponível.");
    }

    const n = Number(numeroPagina);
    if (!Number.isFinite(n) || n < 1) throw new Error("Página inválida.");

    const paths = info.pagePaths?.length
        ? info.pagePaths
        : await listarPathsRemotos(info.remote);

    const filePath = paths[n - 1];
    if (!filePath) throw new Error("Página não encontrada.");

    const client = await getClient();
    const dlink = await dlinkParaPath(client, filePath);
    if (!dlink) throw new Error("Link de leitura indisponível.");

    const res = await fetch(dlink, { redirect: "follow" });
    if (!res.ok) throw new Error(`Falha ao carregar imagem (${res.status}).`);

    const contentType = res.headers.get("content-type") || "image/webp";
    const buffer = await res.arrayBuffer();

    return { contentType, buffer };
}
