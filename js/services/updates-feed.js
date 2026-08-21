/**
 * Feed de atualizações — caps ordenados por hostedAt do índice cloud.
 */
let cache = null;
let cacheTs = 0;
const CACHE_MS = 120_000;

function pageLegivel(rec) {
    if (!rec?.done || !rec?.pages?.length) return false;
    return rec.pages.some((p) => {
        const u = String(p.url || "");
        return u.includes("i.ibb.co")
            || u.includes("ibb.co")
            || u.includes("imgbb.com")
            || u.includes("telegra.ph")
            || u.includes("catbox.moe")
            || u.includes("litter.catbox")
            || u.includes("/api/gh-cdn/")
            || u.includes("cdn.discordapp.com")
            || u.includes("/api/discord-img")
            || u.includes("cdn.jsdelivr.net/gh/")
            || u.includes("/api/cloud/page")
            || u.includes("/data/cloud/pages/");
    });
}

async function carregarIndice(force = false) {
    if (!force && cache && Date.now() - cacheTs < CACHE_MS) return cache;
    const res = await fetch(`/data/cloud/chapters-index.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Índice HTTP ${res.status}`);
    cache = await res.json();
    cacheTs = Date.now();
    return cache;
}

/**
 * @returns {Promise<Array<{mangaId,capId,numero,titulo,tituloManga,hostedAt,legivel,chapterId}>>}
 */
export async function obterAtualizacoes({ limite = 50, dias = null } = {}) {
    const idx = await carregarIndice();
    const cutoff = dias ? Date.now() - dias * 86400000 : 0;
    const itens = [];

    for (const rec of Object.values(idx.caps || {})) {
        if (!rec?.mangaId || !rec?.capId) continue;
        const hostedAt = rec.hostedAt || rec.uploadedAt || rec.atualizadoEm;
        const ts = Date.parse(hostedAt || "") || 0;
        if (cutoff && ts < cutoff) continue;
        if (!pageLegivel(rec)) continue;
        itens.push({
            mangaId: rec.mangaId,
            capId: rec.capId,
            numero: rec.numero,
            titulo: rec.titulo || `Cap. ${rec.numero}`,
            tituloManga: rec.tituloManga || rec.mangaId,
            hostedAt: hostedAt || new Date(ts || 0).toISOString(),
            legivel: true,
            hosting: rec.hosting
        });
    }

    return itens
        .sort((a, b) => Date.parse(b.hostedAt) - Date.parse(a.hostedAt))
        .slice(0, limite);
}

export async function contarAtualizacoesHoje() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const idx = await carregarIndice();
    let n = 0;
    for (const rec of Object.values(idx.caps || {})) {
        if (!pageLegivel(rec)) continue;
        const ts = Date.parse(rec.hostedAt || "") || 0;
        if (ts >= hoje.getTime()) n++;
    }
    return n;
}

export function formatarTempoRelativo(iso) {
    const ts = Date.parse(iso || "");
    if (!ts) return "";
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d === 1) return "ontem";
    if (d < 7) return `${d}d`;
    return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
