/**
 * Proxy CDN para imagens em repos GitHub PRIVADOS.
 * GET /api/gh-cdn/{repoSlug}/pages/{mangaId}/{capId}/{file}
 *
 * Secrets Cloudflare:
 *   GITHUB_CDN_TOKEN  — PAT com repo (leitura dos repos CDN)
 *   GITHUB_CDN_USER   — dono dos repos (ex: olavoprovisaosolar-byte)
 *   GITHUB_CDN_PREFIX — prefixo dos repos (default: akira-cdn)
 */
function cors() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
    };
}

function cfg(env) {
    return {
        user: String(env.GITHUB_CDN_USER || env.GITHUB_USER || "").trim(),
        token: String(env.GITHUB_CDN_TOKEN || env.GITHUB_TOKEN || "").trim(),
        prefix: String(env.GITHUB_CDN_PREFIX || "akira-cdn").trim(),
        branch: String(env.GITHUB_CDN_BRANCH || "main").trim()
    };
}

function repoName(slug, prefix) {
    return `${prefix}-${slug}`;
}

function ghHeaders(token, accept = "application/vnd.github.raw") {
    return {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "User-Agent": "AkiraScan-GhCdnProxy/1.1"
    };
}

async function fetchGitHubFile(user, repo, filePath, branch, token) {
    const apiUrl = `https://api.github.com/repos/${user}/${repo}/contents/${filePath}?ref=${branch}`;
    let res = await fetch(apiUrl, { headers: ghHeaders(token) });

    if (!res.ok) {
        return { ok: false, status: res.status, error: `GitHub API ${res.status}` };
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        const meta = await res.json();
        if (meta.download_url) {
            res = await fetch(meta.download_url, {
                headers: { Authorization: `Bearer ${token}`, "User-Agent": "AkiraScan-GhCdnProxy/1.1" }
            });
            if (!res.ok) {
                return { ok: false, status: res.status, error: `GitHub download ${res.status}` };
            }
            return { ok: true, response: res };
        }
        return { ok: false, status: 502, error: "GitHub: arquivo sem download_url" };
    }

    return { ok: true, response: res };
}

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors() });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405, headers: cors() });
    }

    try {
        const { user, token, prefix, branch } = cfg(env);
        if (!user || !token) {
            return new Response(JSON.stringify({ ok: false, error: "GITHUB_CDN_TOKEN/USER não configurados" }), {
                status: 503,
                headers: { "Content-Type": "application/json", ...cors() }
            });
        }

        const url = new URL(request.url);
        const parts = url.pathname.replace(/^\/api\/gh-cdn\/?/, "").split("/").filter(Boolean);
        if (parts.length < 2) {
            return new Response("Bad path", { status: 400, headers: cors() });
        }

        const slug = parts[0];
        const filePath = parts.slice(1).join("/");
        const repo = repoName(slug, prefix);

        const result = await fetchGitHubFile(user, repo, filePath, branch, token);
        if (!result.ok) {
            const status = result.status === 404 ? 404 : 502;
            return new Response(result.error || "GitHub error", { status, headers: cors() });
        }

        const ext = filePath.split(".").pop()?.toLowerCase() || "jpg";
        const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[ext]
            || "application/octet-stream";

        const headers = {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            ...cors()
        };

        if (request.method === "HEAD") {
            // Consumir/cancelar body do upstream para não vazar stream
            try { await result.response.arrayBuffer(); } catch { /* ignore */ }
            return new Response(null, { status: 200, headers });
        }

        return new Response(result.response.body, {
            status: 200,
            headers
        });
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...cors() }
        });
    }
}
