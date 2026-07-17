const fs = require("fs");
const path = require("path");

function cors(extra = {}) {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        ...extra
    };
}

function json(statusCode, data) {
    return {
        statusCode,
        headers: cors({ "Content-Type": "application/json", "Cache-Control": "no-store" }),
        body: JSON.stringify(data)
    };
}

function envGet(key) {
    try {
        if (typeof Netlify !== "undefined" && Netlify.env?.get) {
            const v = Netlify.env.get(key);
            if (v != null && String(v).trim() !== "") return String(v);
        }
    } catch { /* fora do runtime Netlify */ }
    return process.env[key] || "";
}

function lerIndice() {
    const candidates = [
        path.join(process.cwd(), "data", "cloud", "chapters-index.json"),
        path.join(process.cwd(), "data", "terabox", "chapters-index.json"),
        path.join(__dirname, "..", "..", "data", "cloud", "chapters-index.json"),
        path.join(__dirname, "..", "..", "data", "terabox", "chapters-index.json"),
        "/var/task/data/cloud/chapters-index.json",
        "/var/task/data/terabox/chapters-index.json"
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                return { path: p, data: JSON.parse(fs.readFileSync(p, "utf8")) };
            }
        } catch { /* next */ }
    }
    return { path: null, data: { caps: {}, total: 0 } };
}

function parseEvent(event) {
    const qs = event.queryStringParameters || {};
    let pathname = event.path || "/";
    try {
        if (event.rawUrl) pathname = new URL(event.rawUrl).pathname;
    } catch { /* keep */ }
    pathname = String(pathname).replace(/\/$/, "") || "/";
    return {
        pathname,
        mangaId: String(qs.m || qs.mangaId || "").trim(),
        capId: String(qs.ch || qs.capId || "").trim(),
        n: qs.n,
        host: event.headers?.host || event.headers?.Host || "akira-scan.netlify.app"
    };
}

function apiOrigin(host) {
    return (envGet("URL") || envGet("DEPLOY_URL") || `https://${host}`).replace(/\/$/, "");
}

async function loadResolver() {
    const modPath = path.join(__dirname, "..", "..", "scripts", "cloud", "cloud-resolver.mjs");
    return import(`file://${modPath.replace(/\\/g, "/")}`);
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 204, headers: cors(), body: "" };
        }
        if (event.httpMethod && event.httpMethod !== "GET") {
            return json(405, { error: "Method not allowed" });
        }

        const { pathname, mangaId, capId, n, host } = parseEvent(event);
        const isStatus = pathname.endsWith("/status") || pathname === "/api/cloud" || pathname.endsWith("/cloud-chapters");
        const isPages = pathname.endsWith("/pages") || /\/cloud\/pages$/.test(pathname);
        const isPage = pathname.endsWith("/page") || /\/cloud\/page$/.test(pathname);

        const { path: indexPath, data: idx } = lerIndice();

        if (isStatus) {
            const key = mangaId && capId ? `${mangaId}/${capId}` : null;
            const info = key ? idx.caps?.[key] : null;
            return json(200, {
                ok: true,
                service: "cloud-chapters",
                hasIndex: Boolean(indexPath),
                indexPath,
                total: idx.total || Object.keys(idx.caps || {}).length,
                hasTerabox: Boolean(envGet("TERABOX_NDUS") || envGet("TERABOX_COOKIE")),
                cap: info ? {
                    done: !!info.done,
                    remote: !!info.remote,
                    purged: !!info.localPurged
                } : null
            });
        }

        if (!mangaId || !capId) {
            return json(400, { error: "Parâmetros m e ch obrigatórios." });
        }

        const info = idx.caps?.[`${mangaId}/${capId}`];
        if (!info?.done || !info.remote) {
            return json(404, {
                error: "Capítulo não disponível no índice remoto.",
                key: `${mangaId}/${capId}`
            });
        }

        const { paginasComUrlsEstaveis, buscarPaginaRemota } = await loadResolver();
        const origin = apiOrigin(host);

        if (isPage) {
            const { contentType, buffer } = await buscarPaginaRemota(mangaId, capId, n);
            const upstreamType = String(contentType || "").toLowerCase();
            const resolvedType = upstreamType.startsWith("image/") ? upstreamType : "image/webp";
            return {
                statusCode: 200,
                headers: cors({
                    "Content-Type": resolvedType,
                    "Cache-Control": "public, max-age=86400, immutable"
                }),
                isBase64Encoded: true,
                body: Buffer.from(buffer).toString("base64")
            };
        }

        if (isPages || (mangaId && capId)) {
            const pages = await paginasComUrlsEstaveis(mangaId, capId, origin);
            return json(200, { pages, mangaId, capId, total: pages.length });
        }

        return json(404, { error: "Rota inválida." });
    } catch (e) {
        return json(502, { error: e?.message || String(e) });
    }
};
