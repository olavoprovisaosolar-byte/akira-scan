/**
 * Estatísticas em tempo real — Firebase Realtime Database + fallback local.
 */
import { rtdb, rtdbAtivo } from "../firebase-config.js";
import { assetUrl } from "../site-config.js";

const RTDB_PATH = "live";
const VISITA_SESSAO = "akirascan_visita_sessao";
let cloudTotalCache = null;

async function obterTotalCapitulosCloud() {
    if (cloudTotalCache != null) return cloudTotalCache;
    try {
        const res = await fetch(assetUrl("data/cloud/chapters-index.json"), { cache: "force-cache" });
        if (!res.ok) return null;
        const data = await res.json();
        cloudTotalCache = data.total || Object.keys(data.caps || {}).length || null;
        return cloudTotalCache;
    } catch {
        return null;
    }
}

function registrarVisitaSessao() {
    try {
        if (sessionStorage.getItem(VISITA_SESSAO)) return;
        sessionStorage.setItem(VISITA_SESSAO, "1");

        const hoje = new Date().toISOString().slice(0, 10);
        const raw = localStorage.getItem("akirascan_visitas");
        const data = raw ? JSON.parse(raw) : { dia: hoje, total: 0 };
        if (data.dia !== hoje) {
            data.dia = hoje;
            data.total = 0;
        }
        data.total += 1;
        localStorage.setItem("akirascan_visitas", JSON.stringify(data));
    } catch { /* ignore */ }
}

function lerVisitasHoje() {
    try {
        const hoje = new Date().toISOString().slice(0, 10);
        const raw = localStorage.getItem("akirascan_visitas");
        const data = raw ? JSON.parse(raw) : { dia: hoje, total: 0 };
        if (data.dia !== hoje) return 0;
        return data.total || 0;
    } catch {
        return 0;
    }
}

function contarCapitulos(catalogo) {
    const fromCatalog = catalogo.reduce(
        (acc, m) => acc + (m.capitulos?.length || m.totalCapitulos || 0),
        0
    );
    return fromCatalog || cloudTotalCache || 7636;
}

export function calcularStatsLocais(catalogo = [], extras = {}) {
    const mangas = catalogo.length || 433;
    const capitulos = extras.chapters ?? contarCapitulos(catalogo);
    const visitas = lerVisitasHoje();
    const baseOnline = 900 + Math.floor(mangas * 2.5);
    const jitter = extras.jitter ?? 0;

    const popular = [...catalogo]
        .sort((a, b) => (b.popularidade || 0) - (a.popularidade || 0))[0];

    return {
        usersOnline: baseOnline + jitter,
        activeReaders: Math.floor((baseOnline + jitter) * 0.72),
        countries: 38 + Math.floor(mangas / 40),
        mangas,
        chapters: capitulos,
        users: Math.max(1200, Math.floor(mangas * 18)),
        visitsToday: visitas + 12000,
        topManga: popular?.titulo || "O Começo Depois do Fim",
        topMangaId: popular?.id || "obra-0f20295f",
        rating: 4.8
    };
}

function normalizarStatsRemotas(data, fallback) {
    return {
        usersOnline: Number(data.usersOnline ?? data.usuariosOnline ?? fallback.usersOnline),
        activeReaders: Number(data.activeReaders ?? data.leitoresAtivos ?? fallback.activeReaders),
        countries: Number(data.countries ?? data.paises ?? fallback.countries),
        mangas: Number(data.mangas ?? data.mangasDisponiveis ?? fallback.mangas),
        chapters: Number(data.chapters ?? data.capitulos ?? fallback.chapters),
        users: Number(data.users ?? data.membros ?? fallback.users),
        visitsToday: Number(data.visitsToday ?? data.visitas ?? fallback.visitsToday),
        topManga: data.topManga ?? data.mangaMaisLido ?? fallback.topManga,
        topMangaId: data.topMangaId ?? fallback.topMangaId,
        rating: Number(data.rating ?? data.avaliacao ?? fallback.rating)
    };
}

export async function observarStatsLive(callback, catalogo = []) {
    registrarVisitaSessao();
    await obterTotalCapitulosCloud();

    let baseStats = calcularStatsLocais(catalogo);
    callback(baseStats);

    let intervalId = null;
    let pulseOn = false;

    const startFallbackPulse = () => {
        if (pulseOn) return;
        pulseOn = true;
        intervalId = setInterval(() => {
            const jitter = Math.floor(Math.random() * 40 - 20);
            const stats = calcularStatsLocais(catalogo, { jitter });
            callback(stats);
        }, 9000);
    };

    const stopFallbackPulse = () => {
        pulseOn = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };

    if (!rtdbAtivo()) {
        startFallbackPulse();
        return stopFallbackPulse;
    }

    try {
        const { ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
        const liveRef = ref(rtdb, RTDB_PATH);
        const unsub = onValue(liveRef, (snap) => {
            if (!snap.exists()) {
                startFallbackPulse();
                return;
            }
            stopFallbackPulse();
            baseStats = calcularStatsLocais(catalogo);
            callback(normalizarStatsRemotas(snap.val(), baseStats));
        }, () => {
            console.warn("[LiveStats] Erro ao ler RTDB, usando fallback.");
            startFallbackPulse();
        });
        return () => {
            unsub();
            stopFallbackPulse();
        };
    } catch (err) {
        console.warn("[LiveStats]", err.message);
        startFallbackPulse();
        return stopFallbackPulse;
    }
}
