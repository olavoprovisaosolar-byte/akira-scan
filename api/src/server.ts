/**
 * AkiraScan API — Node.js + TypeScript
 * Substitui dev-server.mjs com tipagem forte e contrato OpenAPI.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { MangaResponse, BibliotecaResponse, PaginasResponse, ApiError } from "../../shared/types/manga.js";
import { assertManga } from "../../shared/types/manga.js";
import { getRoot, obterMangasCatalogo, obterMangaPorId, obterPaginasCapitulo } from "./lib/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = getRoot();
const PORT = Number(process.env.PORT || 5501);
const HOST = process.env.HOST || "0.0.0.0";

const MIME: Record<string, string> = {
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

function json<T>(res: http.ServerResponse, data: T, status = 200): void {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(data));
}

function safePath(base: string, ...parts: string[]): string | null {
    const resolved = path.resolve(base, ...parts);
    if (!resolved.startsWith(path.resolve(base))) return null;
    return resolved;
}

async function handleCatalogoProxy(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
    try {
        const catalogoHandler = (await import(
            pathToFileURL(path.join(ROOT, "netlify/functions/catalogo.mjs")).href
        )).default as (req: Request) => Promise<Response>;

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
            if (v) headers[k] = Array.isArray(v) ? v[0] : v;
        }

        const webReq = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
            method: req.method || "GET",
            headers
        });
        const webRes = await catalogoHandler(webReq);
        const body = Buffer.from(await webRes.arrayBuffer());
        const outHeaders: Record<string, string | number> = { "Access-Control-Allow-Origin": "*" };
        webRes.headers.forEach((val, key) => { outHeaders[key] = val; });
        res.writeHead(webRes.status, outHeaders);
        res.end(body);
    } catch (e) {
        json<ApiError>(res, { error: (e as Error).message }, 500);
    }
}

function pathToFileURL(p: string): URL {
    return new URL(`file:///${p.replace(/\\/g, "/")}`);
}

function runSync(): { ok: boolean; output: string } {
    const py = spawnSync("python", [path.join(ROOT, "sync/python/toonlivre_sync.py")], {
        cwd: ROOT,
        encoding: "utf8",
        env: process.env
    });
    if (py.status === 0) {
        return { ok: true, output: (py.stdout || "") + (py.stderr || "") };
    }

    const node = spawnSync(process.execPath, [path.join(ROOT, "scripts/sync-toonlivre.mjs")], {
        cwd: ROOT,
        encoding: "utf8",
        env: process.env
    });
    return {
        ok: node.status === 0,
        output: `[Python falhou, fallback Node]\n${(node.stdout || "") + (node.stderr || "")}`
    };
}

function servirEstatico(res: http.ServerResponse, filePath: string): void {
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
}

function servirBiblioteca(res: http.ServerResponse, urlPath: string): void {
    const rel = decodeURIComponent(urlPath.replace(/^\/biblioteca\/?/, ""));
    const segments = rel.split("/");
    const dirs = [path.join(ROOT, "Biblioteca_Mangas")];

    for (const dir of dirs) {
        const candidate = safePath(dir, ...segments);
        if (candidate && fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
            const ext = path.extname(candidate);
            res.writeHead(200, {
                "Content-Type": MIME[ext] || "application/octet-stream",
                "Cache-Control": "public, max-age=86400"
            });
            fs.createReadStream(candidate).pipe(res);
            return;
        }
    }
    res.writeHead(404);
    res.end("Not found");
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);

    try {
        if (url.pathname === "/api/sync" || (url.pathname === "/api/sync" && req.method === "POST")) {
            const result = runSync();
            return json(res, result, result.ok ? 200 : 500);
        }

        if (url.pathname.startsWith("/api/v1/proxy")) {
            try {
                const proxyHandler = (await import("../../dist/server/proxy/handler.js")).default;
                const headers: Record<string, string> = {};
                for (const [k, v] of Object.entries(req.headers)) {
                    if (v) headers[k] = Array.isArray(v) ? v[0] : v;
                }
                const webReq = new Request(`http://127.0.0.1${url.pathname}${url.search}`, {
                    method: req.method || "GET",
                    headers
                });
                const webRes = await proxyHandler(webReq);
                const body = Buffer.from(await webRes.arrayBuffer());
                const outHeaders: Record<string, string | number> = { "Access-Control-Allow-Origin": "*" };
                webRes.headers.forEach((val, key) => { outHeaders[key] = val; });
                res.writeHead(webRes.status, outHeaders);
                res.end(body);
                return;
            } catch (e) {
                json<ApiError>(res, { error: (e as Error).message }, 500);
                return;
            }
        }

        if (url.pathname.startsWith("/api/catalogo")) {
            await handleCatalogoProxy(req, res, url);
            return;
        }

        if (url.pathname.startsWith("/api/manga/")) {
            const mangaId = decodeURIComponent(url.pathname.replace(/^\/api\/manga\/?/, "").split("/")[0]);
            const manga = await obterMangaPorId(mangaId);
            if (!manga) return json<ApiError>(res, { error: "Mangá não encontrado." }, 404);
            assertManga(manga, mangaId);
            return json<MangaResponse>(res, { manga });
        }

        if (url.pathname.startsWith("/api/biblioteca")) {
            const parts = url.pathname.replace(/^\/api\/biblioteca\/?/, "").split("/").filter(Boolean);

            if (parts.length === 0) {
                const mangas = await obterMangasCatalogo();
                return json<BibliotecaResponse>(res, { mangas });
            }

            const [mangaId, capituloId] = parts.map(decodeURIComponent);

            if (parts.length === 1) {
                const manga = await obterMangaPorId(mangaId);
                if (!manga) return json<ApiError>(res, { error: "Mangá não encontrado." }, 404);
                return json<MangaResponse>(res, { manga });
            }

            if (parts.length === 2) {
                const pages = await obterPaginasCapitulo(mangaId, capituloId);
                const payload: PaginasResponse = { manga: mangaId, capitulo: capituloId, pages };
                if (pages[0]?.url.includes("placehold.co")) payload.demo = true;
                return json(res, payload);
            }

            return json<ApiError>(res, { error: "Rota inválida." }, 404);
        }

        if (url.pathname.startsWith("/biblioteca/")) {
            servirBiblioteca(res, url.pathname);
            return;
        }

        if (url.pathname === "/") {
            res.writeHead(302, { Location: "/index.html" });
            res.end();
            return;
        }

        let filePath = path.join(ROOT, url.pathname);
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
        servirEstatico(res, filePath);
    } catch (e) {
        json<ApiError>(res, { error: (e as Error).message }, 500);
    }
});

function ipsRedeLocal(): string[] {
    const ips: string[] = [];
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const cfg of iface || []) {
            if (cfg.family === "IPv4" && !cfg.internal) ips.push(cfg.address);
        }
    }
    return [...new Set(ips)];
}

const bibDir = path.join(ROOT, "Biblioteca_Mangas");
if (!fs.existsSync(bibDir)) fs.mkdirSync(bibDir, { recursive: true });

obterMangasCatalogo().then((mangas) => {
    server.listen(PORT, HOST, () => {
        console.log("AkiraScan API — TypeScript");
        console.log(`  Stack:   Node.js + TS | Sync: Python → Node fallback`);
        console.log(`  OpenAPI: shared/openapi.yaml`);
        console.log(`  Abra:    http://localhost:${PORT}/index.html`);
        for (const ip of ipsRedeLocal()) {
            console.log(`  Wi-Fi:   http://${ip}:${PORT}/index.html`);
        }
        console.log(`  Mangás:  ${mangas.length}`);
    });
});
