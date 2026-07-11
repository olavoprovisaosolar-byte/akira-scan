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
    return process.env[key] || "";
}

function extrairNdus() {
    const ndus = envGet("TERABOX_NDUS").trim();
    if (ndus) return ndus;
    const cookie = envGet("TERABOX_COOKIE").trim();
    if (!cookie) return null;
    const match = cookie.match(/(?:^|;\s*)ndus=([^;]+)/i);
    return match?.[1] || null;
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

async function criarCliente() {
    const ndus = extrairNdus();
    if (!ndus) throw new Error("TERABOX_NDUS não configurado no Netlify.");
    const { TeraBoxApp } = await import("terabox-api");
    const app = new TeraBoxApp(ndus, "ndus");
    await app.checkLogin();
    await app.updateAppData();
    return app;
}

function ordenarPaginas(paths) {
    return [...paths].sort((a, b) => {
        const na = Number(String(a).match(/(\d+)/)?.[1] || 0);
        const nb = Number(String(b).match(/(\d+)/)?.[1] || 0);
        return na - nb || String(a).localeCompare(String(b));
    });
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
        // /pages antes de /page — senão "pages" casa com "page"
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

        const client = await criarCliente();
        const res = await client.getRemoteDir(info.remote);
        const entries = res.list || res.info || res.entries || [];
        const PAGE_EXT = /\.(webp|jpg|jpeg|png)$/i;
        const paths = ordenarPaginas(
            entries
                .filter((e) => !(e.isdir === 1 || e.isdir === true))
                .map((e) => e.path || `${info.remote}/${e.server_filename}`)
                .filter((p) => PAGE_EXT.test(p))
        );

        if (isPage) {
            const pageNum = Number(n);
            const filePath = paths[pageNum - 1];
            if (!filePath) return json(404, { error: "Página não encontrada." });
            const meta = await client.getFileMeta([filePath]);
            const item = (meta?.info || meta?.list || [])[0];
            const dlink = item?.dlink || item?.dlink_url;
            if (!dlink) return json(502, { error: "Link de leitura indisponível." });
            const img = await fetch(dlink, { redirect: "follow" });
            if (!img.ok) return json(502, { error: `Falha ao carregar imagem (${img.status}).` });
            const buf = Buffer.from(await img.arrayBuffer());
            const upstreamType = String(img.headers.get("content-type") || "").toLowerCase();
            const contentType = upstreamType.startsWith("image/")
                ? upstreamType
                : "image/webp";
            return {
                statusCode: 200,
                headers: cors({
                    "Content-Type": contentType,
                    "Cache-Control": "public, max-age=86400, immutable"
                }),
                isBase64Encoded: true,
                body: buf.toString("base64")
            };
        }

        if (isPages || (mangaId && capId)) {
            const origin = (envGet("URL") || envGet("DEPLOY_URL") || `https://${host}`).replace(/\/$/, "");
            const pages = paths.map((_, i) => ({
                index: i,
                url: `${origin}/api/cloud/page?m=${encodeURIComponent(mangaId)}&ch=${encodeURIComponent(capId)}&n=${i + 1}`,
                origem: "remoto"
            }));
            return json(200, { pages, mangaId, capId, total: pages.length });
        }

        return json(404, { error: "Rota inválida." });
    } catch (e) {
        return json(502, { error: e?.message || String(e) });
    }
};
