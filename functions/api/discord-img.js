/**
 * Proxy Discord CDN — GET /api/discord-img?ch=&msg=&att=
 *
 * 1) Se DISCORD_BOT_TOKEN estiver no Pages: renova URL via API Discord
 * 2) Senão: usa discordUrl do chapters-index (pode expirar)
 *
 * Secrets Cloudflare Pages (opcional):
 *   DISCORD_BOT_TOKEN — bot com acesso aos canais de upload
 */
function cors() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
    };
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...cors() }
    });
}

function mimeFromUrl(url) {
    const path = String(url).split("?")[0].toLowerCase();
    if (path.endsWith(".png")) return "image/png";
    if (path.endsWith(".webp")) return "image/webp";
    if (path.endsWith(".gif")) return "image/gif";
    return "image/jpeg";
}

let cachedIndex = null;
let cachedAt = 0;
const INDEX_TTL_MS = 60_000;

async function loadIndex(env) {
    if (cachedIndex && Date.now() - cachedAt < INDEX_TTL_MS) return cachedIndex;
    const raw = String(env.GITHUB_INDEX_RAW_URL || "").trim()
        || "https://raw.githubusercontent.com/olavoprovisaosolar-byte/akira-scan/main/data/cloud/chapters-index.json";
    const headers = { "User-Agent": "AkiraScan-DiscordImg/1.0", Accept: "application/json" };
    const token = String(env.GITHUB_TOKEN || env.GITHUB_CDN_TOKEN || "").trim();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(raw, { headers });
    if (!res.ok) throw new Error(`index HTTP ${res.status}`);
    cachedIndex = await res.json();
    cachedAt = Date.now();
    return cachedIndex;
}

function findPage(index, ch, msg, att) {
    for (const rec of Object.values(index?.caps || {})) {
        for (const p of rec.pages || []) {
            if (att && String(p.discordAttachmentId || "") === att) return p;
            if (
                String(p.discordChannelId || "") === ch
                && String(p.discordMessageId || "") === msg
                && (!att || String(p.discordAttachmentId || "") === att)
            ) {
                return p;
            }
            const u = String(p.url || "");
            if (u.includes("/api/discord-img") && u.includes(`ch=${ch}`) && u.includes(`msg=${msg}`)) {
                if (!att || u.includes(`att=${att}`)) return p;
            }
        }
    }
    return null;
}

async function refreshDiscordUrl(ch, msg, att, botToken) {
    const api = `https://discord.com/api/v10/channels/${ch}/messages/${msg}`;
    const res = await fetch(api, {
        headers: {
            Authorization: `Bot ${botToken}`,
            "User-Agent": "AkiraScan-DiscordImg/1.0"
        }
    });
    if (!res.ok) {
        return { ok: false, status: res.status, error: `Discord API ${res.status}` };
    }
    const data = await res.json();
    const attachments = Array.isArray(data.attachments) ? data.attachments : [];
    const hit = att
        ? attachments.find((a) => String(a.id) === att)
        : attachments[0];
    if (!hit?.url) return { ok: false, status: 404, error: "Attachment não encontrado na mensagem" };
    return { ok: true, url: hit.url, proxyUrl: hit.proxy_url || hit.url };
}

async function fetchImage(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; AkiraScan/1.0)",
            Accept: "image/*,*/*"
        },
        redirect: "follow"
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, response: res };
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
    }
    if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: cors() });
    }

    try {
        const url = new URL(request.url);
        const ch = (url.searchParams.get("ch") || "").trim();
        const msg = (url.searchParams.get("msg") || "").trim();
        const att = (url.searchParams.get("att") || "").trim();
        if (!ch || !msg) {
            return json({ ok: false, error: "Parâmetros ch e msg obrigatórios" }, 400);
        }

        const botToken = String(env.DISCORD_BOT_TOKEN || "").trim();
        let target = null;

        if (botToken) {
            const refreshed = await refreshDiscordUrl(ch, msg, att, botToken);
            if (refreshed.ok) target = refreshed.proxyUrl || refreshed.url;
        }

        if (!target) {
            const index = await loadIndex(env);
            const page = findPage(index, ch, msg, att);
            target = page?.discordUrl || null;
            if (!target && page?.url && !String(page.url).includes("/api/discord-img")) {
                target = page.url;
            }
        }

        if (!target) {
            return json({
                ok: false,
                error: "Imagem Discord indisponível (URL expirada). Configure DISCORD_BOT_TOKEN ou re-hospede com Freeimage no PC."
            }, 404);
        }

        const img = await fetchImage(target);
        if (!img.ok) {
            return json({
                ok: false,
                error: `Falha ao obter imagem Discord (${img.status}). Re-hospede o cap (upload:keep-alive).`
            }, img.status === 404 ? 404 : 502);
        }

        return new Response(img.response.body, {
            status: 200,
            headers: {
                "Content-Type": img.response.headers.get("content-type") || mimeFromUrl(target),
                "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
                ...cors()
            }
        });
    } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
    }
}
