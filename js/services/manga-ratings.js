import { cloudApiUrl } from "../site-config.js";
import { temSessaoApi } from "../user-api.js";

const KEY = "akirascan_ratings_v1";

function lerLocal() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch {
        return {};
    }
}

function guardarLocal(map) {
    try {
        localStorage.setItem(KEY, JSON.stringify(map));
    } catch { /* quota */ }
}

function authHeaders() {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    try {
        const sess = JSON.parse(localStorage.getItem("akirascan_sessao") || "null");
        if (sess?.token) headers.Authorization = `Bearer ${sess.token}`;
    } catch { /* ignore */ }
    return headers;
}

export function obterNotaLocal(mangaId) {
    return Number(lerLocal()[mangaId]) || 0;
}

export async function obterRating(mangaId) {
    const mine = obterNotaLocal(mangaId);
    if (!mangaId) return { avg: 0, count: 0, mine };
    try {
        const res = await fetch(cloudApiUrl("api/ratings") + `?mangaId=${encodeURIComponent(mangaId)}`, {
            headers: authHeaders()
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            return { avg: Number(data.avg) || 0, count: Number(data.count) || 0, mine: Number(data.mine) || mine };
        }
    } catch { /* offline */ }
    return { avg: mine, count: mine ? 1 : 0, mine };
}

export async function guardarRating(mangaId, score) {
    const n = Math.max(1, Math.min(5, Number(score) || 0));
    const map = lerLocal();
    map[mangaId] = n;
    guardarLocal(map);
    if (!temSessaoApi()) return { ok: true, avg: n, count: 1, mine: n };
    try {
        const res = await fetch(cloudApiUrl("api/ratings"), {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ mangaId, score: n })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
            return { ok: true, avg: Number(data.avg) || n, count: Number(data.count) || 1, mine: n };
        }
    } catch { /* offline */ }
    return { ok: true, avg: n, count: 1, mine: n };
}
