/**
 * Índice de capítulos via GitHub — leitura raw + escrita Contents API.
 * Modo gratuito: sem R2, sem KV, sem cartão Cloudflare.
 */

export const DEFAULT_GITHUB_REPO = "olavoprovisaosolar-byte/akira-scan";
export const DEFAULT_GITHUB_BRANCH = "main";
export const DEFAULT_INDEX_PATH = "data/cloud/chapters-index.json";

const EMPTY_INDEX = { caps: {}, porManga: {}, origem: "github", total: 0 };

function encodeBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/** @param {Record<string, string|undefined>} env */
export function githubIndexConfig(env = {}) {
    const repo = String(
        env.GITHUB_REPO || env.GITHUB_REPOSITORY || DEFAULT_GITHUB_REPO
    ).trim();
    const branch = String(env.GITHUB_BRANCH || DEFAULT_GITHUB_BRANCH).trim();
    const indexPath = String(env.GITHUB_INDEX_PATH || DEFAULT_INDEX_PATH).trim();
    const token = String(env.GITHUB_TOKEN || "").trim();
    const rawUrl = String(env.GITHUB_INDEX_RAW_URL || "").trim()
        || `https://raw.githubusercontent.com/${repo}/${branch}/${indexPath}`;
    return { repo, branch, indexPath, token, rawUrl };
}

/** @param {import("@cloudflare/workers-types").R2Bucket|null} bucket @param {Record<string, string|undefined>} env */
export function indexStorageMode(bucket, env = {}) {
    if (bucket) return "r2";
    const { token, rawUrl } = githubIndexConfig(env);
    if (token || rawUrl) return "github";
    return "none";
}

/** @param {Record<string, string|undefined>} env */
export async function readIndexFromGitHub(env = {}) {
    const { token, rawUrl } = githubIndexConfig(env);
    const headers = { Accept: "application/vnd.github.raw+json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${rawUrl}?t=${Date.now()}`, {
        headers,
        cf: { cacheTtl: 60, cacheEverything: true }
    });

    if (res.status === 404) return { ...EMPTY_INDEX };
    if (!res.ok) {
        throw new Error(`GitHub raw HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const data = await res.json();
    data.origem = data.origem || "github";
    data.total = data.total || Object.keys(data.caps || {}).length;
    return data;
}

/** @param {Record<string, string|undefined>} env @param {object} data */
export async function writeIndexToGitHub(env, data) {
    const { repo, branch, indexPath, token } = githubIndexConfig(env);
    if (!token) {
        throw new Error("GITHUB_TOKEN ausente — configure secret no Pages ou commite o índice via git.");
    }

    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
        throw new Error(`GITHUB_REPO inválido: ${repo}`);
    }

    const apiBase = `https://api.github.com/repos/${owner}/${repoName}/contents/${indexPath}`;
    const ghHeaders = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "akira-scan-pages-api"
    };

    let sha;
    const getRes = await fetch(`${apiBase}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
    if (getRes.ok) {
        const existing = await getRes.json();
        sha = existing.sha;
    } else if (getRes.status !== 404) {
        throw new Error(`GitHub GET contents HTTP ${getRes.status}`);
    }

    const content = encodeBase64Utf8(JSON.stringify(data, null, 2));
    const putRes = await fetch(apiBase, {
        method: "PUT",
        headers: ghHeaders,
        body: JSON.stringify({
            message: `api: update ${indexPath}`,
            content,
            branch,
            ...(sha ? { sha } : {})
        })
    });

    if (!putRes.ok) {
        const err = await putRes.text();
        throw new Error(`GitHub PUT contents HTTP ${putRes.status}: ${err.slice(0, 300)}`);
    }

    return data;
}
