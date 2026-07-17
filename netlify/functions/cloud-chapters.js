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

function lerIndice() {
    const candidates = [
        path.join(process.cwd(), "data", "cloud", "chapters-index.json"),
        path.join(__dirname, "..", "..", "data", "cloud", "chapters-index.json"),
        "/var/task/data/cloud/chapters-index.json"
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

function capTemTelegra(info) {
    return !!(info?.pages?.length && info.pages.some((p) => String(p.url || "").includes("telegra.ph")));
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
        capId: String(qs.ch || qs.capId || "").trim()
    };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 204, headers: cors(), body: "" };
        }
        if (event.httpMethod && event.httpMethod !== "GET") {
            return json(405, { error: "Method not allowed" });
        }

        const { pathname, mangaId, capId } = parseEvent(event);
        const isStatus = pathname.endsWith("/status") || pathname === "/api/cloud" || pathname.endsWith("/cloud-chapters");

        if (!isStatus) {
            return json(410, {
                error: "Proxy Terabox descontinuado. Capítulos são servidos via URLs Telegra.ph no índice estático.",
                hint: "Use /api/cloud/status para diagnóstico."
            });
        }

        const { path: indexPath, data: idx } = lerIndice();
        const key = mangaId && capId ? `${mangaId}/${capId}` : null;
        const info = key ? idx.caps?.[key] : null;

        return json(200, {
            ok: true,
            service: "cloud-chapters",
            hosting: "telegra",
            hasIndex: Boolean(indexPath),
            indexPath,
            total: idx.total || Object.keys(idx.caps || {}).length,
            cap: info ? {
                done: !!info.done,
                hosting: info.hosting || null,
                legivel: capTemTelegra(info),
                purged: !!info.localPurged,
                pages: info.pages?.length || 0
            } : null
        });
    } catch (e) {
        return json(502, { error: e?.message || String(e) });
    }
};
