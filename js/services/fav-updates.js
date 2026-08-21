import { obterFavoritos } from "../storage.js";
import { obterAtualizacoes } from "./updates-feed.js";
import { obterPrefs } from "../perfil-prefs.js";

const SEEN_KEY = "akirascan_fav_seen_v1";

function lerSeen() {
    try {
        return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
    } catch {
        return {};
    }
}

function guardarSeen(map) {
    try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(map));
    } catch { /* quota */ }
}

export async function contarNovosFavoritos() {
    const favs = obterFavoritos();
    if (!favs.length) return 0;
    const updates = await obterAtualizacoes({ limite: 100, dias: 14 });
    const seen = lerSeen();
    let n = 0;
    const seenTitles = new Set();
    for (const u of updates) {
        if (!favs.includes(u.mangaId) || seenTitles.has(u.mangaId)) continue;
        const last = Date.parse(seen[u.mangaId] || 0) || 0;
        const ts = Date.parse(u.hostedAt) || 0;
        if (ts > last) {
            seenTitles.add(u.mangaId);
            n++;
        }
    }
    return n;
}

export function marcarFavoritosVistos() {
    const favs = obterFavoritos();
    const seen = lerSeen();
    const now = new Date().toISOString();
    for (const id of favs) seen[id] = now;
    guardarSeen(seen);
}

export async function initNotifBadge() {
    const btn = document.getElementById("header-notif-btn");
    const badge = document.getElementById("header-notif-badge");
    if (!btn || !badge) return;

    btn.addEventListener("click", () => marcarFavoritosVistos());

    if (obterPrefs().notifComments === false) {
        badge.classList.add("escondido");
        return;
    }

    try {
        const n = await contarNovosFavoritos();
        if (n > 0) {
            badge.textContent = n > 9 ? "9+" : String(n);
            badge.classList.remove("escondido");
            badge.setAttribute("aria-hidden", "false");
            btn.setAttribute("title", `${n} capítulo(s) novo(s) nos favoritos`);
        } else {
            badge.classList.add("escondido");
        }
    } catch {
        badge.classList.add("escondido");
    }
}
