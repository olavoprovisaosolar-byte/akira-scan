/**
 * Servidor local AkiraScan — estático + biblioteca local + rede Wi-Fi
 */
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import {
    obterCapituloPaginas,
    obterCapituloPaginasBackup,
    obterMangasCatalogo,
    resolverBibliotecaDirs
} from "../netlify/functions/biblioteca-local.mjs";
import { mergeCatalogo, paginasDemo } from "../js/mangas-destaque.js";
import { obterOuCachearCapitulo } from "./chapter-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BIBLIOTECA_DIRS = resolverBibliotecaDirs(ROOT);
const PORT = process.env.PORT || 5501;
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
};

function corsJson(res, data, status = 200) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(data));
}

function safePath(base, ...parts) {
    const resolved = path.resolve(base, ...parts);
    if (!resolved.startsWith(path.resolve(base))) return null;
    return resolved;
}

function encontrarPastaManga(mangaId) {
    for (const dir of BIBLIOTECA_DIRS) {
        if (fs.existsSync(path.join(dir, mangaId))) return dir;
    }
    return BIBLIOTECA_DIRS[0];
}

function obterMangasCatalogoLocal() {
    return obterMangasCatalogo(ROOT, mergeCatalogo);
}

let catalogoCache = null;
let catalogoCacheTs = 0;
let catalogoCacheVersion = 0;
const CATALOGO_CACHE_MS = 120000;
const CATALOGO_CACHE_VERSION = 3;

function obterMangasCatalogoCached() {
    if (catalogoCacheVersion !== CATALOGO_CACHE_VERSION) {
        catalogoCache = null;
        catalogoCacheVersion = CATALOGO_CACHE_VERSION;
    }
    if (catalogoCache && Date.now() - catalogoCacheTs < CATALOGO_CACHE_MS) {
        return catalogoCache;
    }
    catalogoCache = obterMangasCatalogoLocal();
    catalogoCacheTs = Date.now();
    return catalogoCache;
}

async function handleCatalogoApi(req, res, url) {
    try {
        const catalogoHandler = (await import("../netlify/functions/catalogo.mjs")).default;
        const headers = {};
        for (const [k, v] of Object.entries(req.headers)) {
            if (v) headers[k] = Array.isArray(v) ? v[0] : v;
        }
        const webReq = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
            method: req.method || "GET",
            headers
        });
        const webRes = await catalogoHandler(webReq);
        const body = Buffer.from(await webRes.arrayBuffer());
        const outHeaders = { "Access-Control-Allow-Origin": "*" };
        webRes.headers.forEach((val, key) => { outHeaders[key] = val; });
        res.writeHead(webRes.status, outHeaders);
        res.end(body);
    } catch (e) {
        corsJson(res, { error: e.message }, 500);
    }
}

async function handleBibliotecaApi(req, res, url) {
    const parts = url.pathname.replace(/^\/api\/biblioteca\/?/, "").split("/").filter(Boolean);
    const mangas = obterMangasCatalogoCached();

    if (parts.length === 0) {
        if (req.method === "HEAD") {
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "X-Catalog-Count": String(mangas.length)
            });
            return res.end();
        }
        return corsJson(res, { mangas });
    }

    const [mangaId, capituloId] = parts.map(decodeURIComponent);

    if (parts.length === 1) {
        const manga = mangas.find((m) => m.id === mangaId);
        if (!manga) return corsJson(res, { error: "Mangá não encontrado." }, 404);
        return corsJson(res, { manga });
    }

    if (parts.length === 2) {
        const base = encontrarPastaManga(mangaId);
        let pages = obterCapituloPaginas(base, mangaId, capituloId);
        if (!pages?.length) {
            pages = obterCapituloPaginasBackup(ROOT, mangaId, capituloId);
        }

        if (!pages?.length) {
            const manga = mangas.find((m) => m.id === mangaId);
            const cap = manga?.capitulos?.find((c) => c.id === capituloId);
            const numero = cap?.numero ?? url.searchParams.get("n");
            try {
                pages = await obterOuCachearCapitulo(ROOT, mangaId, capituloId, numero);
            } catch (e) {
                console.warn("[Biblioteca] cache capítulo:", e.message);
            }
        }

        if (pages?.length) {
            return corsJson(res, { manga: mangaId, capitulo: capituloId, pages, local: true });
        }

        const demo = paginasDemo(mangaId, capituloId);
        if (demo.length) {
            return corsJson(res, { manga: mangaId, capitulo: capituloId, pages: demo, demo: true });
        }
        return corsJson(res, { error: "Capítulo não encontrado." }, 404);
    }

    return corsJson(res, { error: "Rota inválida." }, 404);
}

function servirBackupEstatico(req, res, urlPath) {
    const rel = decodeURIComponent(urlPath.replace(/^\/backup\/?/, ""));
    const segments = rel.split("/");
    const backupRoot = path.join(ROOT, "data", "toonlivre-backup");
    const filePath = safePath(backupRoot, ...segments);

    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400"
    });
    fs.createReadStream(filePath).pipe(res);
}

function servirBibliotecaEstatico(req, res, urlPath) {
    const rel = decodeURIComponent(urlPath.replace(/^\/biblioteca\/?/, ""));
    const segments = rel.split("/");

    let filePath = null;
    for (const dir of BIBLIOTECA_DIRS) {
        const candidate = safePath(dir, ...segments);
        if (candidate && fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
            filePath = candidate;
            break;
        }
    }

    if (!filePath) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=86400"
    });
    fs.createReadStream(filePath).pipe(res);
}

function servirTeraboxCache(res) {
    const cachePath = path.join(ROOT, "data", "terabox", "mangas-cache.json");
    if (!fs.existsSync(cachePath)) {
        return corsJson(res, {
            atualizadoEm: null,
            origem: "terabox",
            pasta: process.env.TERABOX_REMOTE_DIR || "/meus_mangas",
            total: 0,
            itens: [],
            aviso: "Cache vazio. Execute: npm run terabox:sync"
        });
    }
    try {
        const data = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        return corsJson(res, data);
    } catch (e) {
        return corsJson(res, { error: e.message }, 500);
    }
}

    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === "/api/sync") {
        try {
            const r = spawnSync(process.execPath, [path.join(__dirname, "sync-toonlivre.mjs")], {
                cwd: ROOT,
                encoding: "utf8",
                env: process.env
            });
            return corsJson(res, {
                ok: r.status === 0,
                output: (r.stdout || "") + (r.stderr || "")
            }, r.status === 0 ? 200 : 500);
        } catch (e) {
            return corsJson(res, { error: e.message }, 500);
        }
    }

    if (url.pathname.startsWith("/api/v1/proxy")) {
        try {
            const proxyHandler = (await import("../dist/server/proxy/handler.js")).default;
            const headers = {};
            for (const [k, v] of Object.entries(req.headers)) {
                if (v) headers[k] = Array.isArray(v) ? v[0] : v;
            }
            const webReq = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
                method: req.method || "GET",
                headers
            });
            const webRes = await proxyHandler(webReq);
            const body = Buffer.from(await webRes.arrayBuffer());
            const outHeaders = { "Access-Control-Allow-Origin": "*" };
            webRes.headers.forEach((val, key) => { outHeaders[key] = val; });
            res.writeHead(webRes.status, outHeaders);
            res.end(body);
        } catch (e) {
            corsJson(res, { error: e.message }, 500);
        }
        return;
    }

    if (url.pathname.startsWith("/api/catalogo")) {
        await handleCatalogoApi(req, res, url);
        return;
    }

    if (url.pathname === "/api/terabox/catalog" || url.pathname === "/data/terabox/mangas-cache.json") {
        servirTeraboxCache(res);
        return;
    }

    if (url.pathname === "/data/terabox/chapters-index.json") {
        const idxPath = path.join(ROOT, "data", "terabox", "chapters-index.json");
        if (!fs.existsSync(idxPath)) {
            return corsJson(res, { caps: {}, porManga: {}, aviso: "Execute: npm run terabox:build-index" });
        }
        try {
            return corsJson(res, JSON.parse(fs.readFileSync(idxPath, "utf8")));
        } catch (e) {
            return corsJson(res, { error: e.message }, 500);
        }
    }

    if (url.pathname.startsWith("/api/biblioteca")) {
        try {
            await handleBibliotecaApi(req, res, url);
        } catch (e) {
            corsJson(res, { error: e.message }, 500);
        }
        return;
    }

    if (url.pathname.startsWith("/api/manga/")) {
        try {
            const mangaId = decodeURIComponent(
                url.pathname.replace(/^\/api\/manga\/?/, "").split("/")[0]
            );
            const mangas = obterMangasCatalogoCached();
            const manga = mangas.find((m) => m.id === mangaId);
            if (!manga) return corsJson(res, { error: "Mangá não encontrado." }, 404);
            return corsJson(res, { manga });
        } catch (e) {
            return corsJson(res, { error: e.message }, 500);
        }
    }

    if (url.pathname.startsWith("/backup/")) {
        servirBackupEstatico(req, res, url.pathname);
        return;
    }

    if (url.pathname.startsWith("/biblioteca/")) {
        servirBibliotecaEstatico(req, res, url.pathname);
        return;
    }

    if (url.pathname === "/") {
        res.writeHead(302, { Location: "/index.html" });
        res.end();
        return;
    }

    let filePath = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
});

function ipsRedeLocal() {
    const ips = [];
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const cfg of iface || []) {
            if (cfg.family === "IPv4" && !cfg.internal) ips.push(cfg.address);
        }
    }
    return [...new Set(ips)];
}

/** Abre o browser automaticamente (desativar: AKIRA_NO_OPEN=1). */
function abrirNavegador(url) {
    if (process.env.AKIRA_NO_OPEN === "1") return;
    const cmd =
        process.platform === "win32" ? `start "" "${url}"` :
        process.platform === "darwin" ? `open "${url}"` :
        `xdg-open "${url}"`;
    try {
        spawn(cmd, { shell: true, stdio: "ignore", detached: true }).unref();
    } catch { /* ignore */ }
}

for (const dir of BIBLIOTECA_DIRS) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

let mangasIniciais = obterMangasCatalogoCached();

server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}/index.html`;
    console.log("AkiraScan — servidor local");
    console.log(`  Abra:    ${url}`);
    for (const ip of ipsRedeLocal()) {
        console.log(`  Wi-Fi:   http://${ip}:${PORT}/biblioteca.html`);
    }
    for (const dir of BIBLIOTECA_DIRS) {
        console.log(`  Pasta:   ${dir}`);
    }
    console.log(`  Mangás:  ${mangasIniciais.length}`);
    abrirNavegador(url);
});
