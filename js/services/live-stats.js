/**
 * Estatísticas em tempo real — Firebase Realtime Database + fallback local.
 */
import { obterConfigFirebase, firebaseConfigurado } from "../firebase-config.js";

const RTDB_PATH = "live";
let rtdb = null;
let rtdbReady = false;

async function initRtdb() {
    if (rtdbReady) return rtdb;
    rtdbReady = true;
    if (!firebaseConfigurado()) return null;

    try {
        const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
        const { getDatabase, ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
        const cfg = obterConfigFirebase();
        const databaseURL = cfg.databaseURL
            || `https://${cfg.projectId}-default-rtdb.firebaseio.com`;

        const app = getApps().length
            ? getApps()[0]
            : initializeApp({ ...cfg, databaseURL });

        rtdb = { db: getDatabase(app), ref, onValue };
        return rtdb;
    } catch (err) {
        console.warn("[LiveStats] Firebase RTDB indisponível:", err.message);
        return null;
    }
}

function lerVisitasLocais() {
    try {
        const hoje = new Date().toISOString().slice(0, 10);
        const raw = localStorage.getItem("akirascan_visitas");
        const data = raw ? JSON.parse(raw) : { dia: hoje, total: 0 };
        if (data.dia !== hoje) {
            data.dia = hoje;
            data.total = 0;
        }
        data.total += 1;
        localStorage.setItem("akirascan_visitas", JSON.stringify(data));
        return data.total;
    } catch {
        return 1;
    }
}

function contarCapitulos(catalogo) {
    return catalogo.reduce((acc, m) => acc + (m.capitulos?.length || m.totalCapitulos || 0), 0);
}

export function calcularStatsLocais(catalogo = []) {
    const mangas = catalogo.length || 433;
    const capitulos = contarCapitulos(catalogo) || 7636;
    const visitas = lerVisitasLocais();
    const baseOnline = 900 + Math.floor(mangas * 2.5);

    const popular = [...catalogo]
        .sort((a, b) => (b.popularidade || 0) - (a.popularidade || 0))[0];

    return {
        usersOnline: baseOnline + Math.floor(Math.random() * 120),
        activeReaders: Math.floor(baseOnline * 0.72),
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
    const fallback = calcularStatsLocais(catalogo);
    callback(fallback);

    let intervalId = null;
    const startFallbackPulse = () => {
        intervalId = setInterval(() => {
            const next = calcularStatsLocais(catalogo);
            callback({
                ...next,
                usersOnline: fallback.usersOnline + Math.floor(Math.random() * 40 - 20),
                activeReaders: fallback.activeReaders + Math.floor(Math.random() * 30 - 15)
            });
        }, 9000);
    };

    const fb = await initRtdb();
    if (!fb) {
        startFallbackPulse();
        return () => clearInterval(intervalId);
    }

    try {
        const liveRef = fb.ref(fb.db, RTDB_PATH);
        const unsub = fb.onValue(liveRef, (snap) => {
            if (!snap.exists()) {
                startFallbackPulse();
                return;
            }
            if (intervalId) clearInterval(intervalId);
            callback(normalizarStatsRemotas(snap.val(), fallback));
        }, () => {
            console.warn("[LiveStats] Erro ao ler RTDB, usando fallback.");
            startFallbackPulse();
        });
        return () => {
            unsub();
            clearInterval(intervalId);
        };
    } catch (err) {
        console.warn("[LiveStats]", err.message);
        startFallbackPulse();
        return () => clearInterval(intervalId);
    }
}
