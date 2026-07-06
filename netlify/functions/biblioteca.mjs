import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    obterCapituloPaginas,
    obterCapituloPaginasBackup,
    carregarCatalogoIndice,
    carregarMangaPorId,
    resolverBibliotecaDirs
} from "./biblioteca-local.mjs";

function functionDir() {
    return path.dirname(fileURLToPath(import.meta.url));
}

function resolveRoot() {
    const fnDir = functionDir();
    const candidates = [
        process.cwd(),
        path.join(fnDir, "..", ".."),
        path.join("/var/task"),
        path.join("/var/task/repository")
    ];
    for (const root of candidates) {
        if (fs.existsSync(path.join(root, "data", "catalogo-index.json"))) return root;
        if (fs.existsSync(path.join(root, "data", "catalogo.json"))) return root;
    }
    return path.join(fnDir, "..", "..");
}

const ROOT = resolveRoot();

function corsJson(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60"
        }
    });
}

function encontrarPastaManga(dirs, mangaId) {
    for (const dir of dirs) {
        if (fs.existsSync(path.join(dir, mangaId))) return dir;
    }
    return dirs[0];
}

function paginasDemo(mangaId, capituloId) {
    const tail = String(capituloId).match(/-(\d+(?:\.\d+)?)$/);
    const cap = tail ? Number(tail[1]) : 1;
    return Array.from({ length: 6 }, (_, i) => ({
        index: i,
        url: `https://placehold.co/800x1200/141419/c44dff?text=${encodeURIComponent(mangaId)}+Cap${cap}+P${i + 1}`
    }));
}

function routeParts(req, context) {
    const fromParam = (context?.params?.splat || "").split("/").filter(Boolean);
    if (fromParam.length) return fromParam.map(decodeURIComponent);

    const url = new URL(req.url);
    let p = url.pathname;
    for (const prefix of ["/api/biblioteca/", "/api/manga/", "/.netlify/functions/biblioteca/"]) {
        if (p.startsWith(prefix)) {
            p = p.slice(prefix.length);
            break;
        }
    }
    return p.split("/").filter(Boolean).map(decodeURIComponent);
}

export default async (req, context) => {
    try {
        if (req.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: { "Access-Control-Allow-Origin": "*" }
            });
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
            return corsJson({ error: "Method not allowed" }, 405);
        }

        const parts = routeParts(req, context);

        if (parts.length === 2) {
            const [mangaId, capituloId] = parts;
            const dirs = resolverBibliotecaDirs(ROOT);
            const base = encontrarPastaManga(dirs, mangaId);
            let pages = obterCapituloPaginas(base, mangaId, capituloId);
            if (!pages?.length) {
                pages = obterCapituloPaginasBackup(ROOT, mangaId, capituloId);
            }

            if (pages?.length) {
                return corsJson({ manga: mangaId, capitulo: capituloId, pages, local: true });
            }

            const demo = paginasDemo(mangaId, capituloId);
            if (demo.length) {
                return corsJson({ manga: mangaId, capitulo: capituloId, pages: demo, demo: true });
            }
            return corsJson({ error: "Capítulo não encontrado." }, 404);
        }

        if (parts.length === 0) {
            const mangas = carregarCatalogoIndice(ROOT) || [];
            if (req.method === "HEAD") {
                return new Response(null, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "X-Catalog-Count": String(mangas.length)
                    }
                });
            }
            return corsJson({ mangas });
        }

        if (parts.length === 1) {
            const mangaId = parts[0];
            const manga = carregarMangaPorId(ROOT, mangaId);
            if (!manga) return corsJson({ error: "Mangá não encontrado." }, 404);
            return corsJson({ manga });
        }

        return corsJson({ error: "Rota inválida." }, 404);
    } catch (err) {
        console.error("biblioteca error:", err);
        return corsJson({ error: err?.message || "Erro interno." }, 500);
    }
};

export const config = {
    path: "/api/biblioteca/*"
};
