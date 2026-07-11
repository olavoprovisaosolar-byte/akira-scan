/**
 * Hero HUD — globo 3D holográfico + painéis de estatísticas em tempo real.
 */
import { linkBiblioteca } from "../core/router.js";
import { observarStatsLive } from "../services/live-stats.js";
import { escHtml } from "../app-shell.js";

let sceneHandle = null;
let statsUnsub = null;
let animTimers = [];
const counterGens = new WeakMap();

function supportsWebGL() {
    try {
        const c = document.createElement("canvas");
        return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
        return false;
    }
}

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fmtNum(n) {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString("pt-BR");
}

function statRow(icon, label, value, key) {
    return `
    <div class="hero-hud-stat" data-stat="${escHtml(key)}">
        <span class="hero-hud-stat-icon" aria-hidden="true">${icon}</span>
        <div class="hero-hud-stat-body">
            <span class="hero-hud-stat-label">${escHtml(label)}</span>
            <strong class="hero-hud-stat-value" data-value="">0</strong>
        </div>
    </div>`;
}

function renderHudShell(mode) {
    const reduced = prefersReducedMotion();
    const globeInner = mode === "webgl"
        ? `<div class="hero-hud-globe-wrap" id="hero-hud-globe">
               <canvas class="hero-hud-canvas" id="hero-webgl-canvas" aria-hidden="true"></canvas>
               <div class="hero-hud-globe-glow" aria-hidden="true"></div>
           </div>`
        : `<div class="hero-hud-globe-wrap hero-hud-globe-fallback" aria-hidden="true">
               <div class="planet-orbit planet-orbit-ambient">
                   <div class="planet-3d">
                       <div class="planet-sphere"></div>
                       <div class="planet-atmosphere"></div>
                       <div class="planet-ring"></div>
                   </div>
               </div>
           </div>`;

    return `
    <section class="hero-hud${reduced ? " hero-hud-reduced" : " hero-hud-init"}" aria-label="AkiraScan Intelligence">
        <div class="hero-hud-bg" aria-hidden="true">
            <div class="hero-hud-grid"></div>
            <div class="hero-hud-particles"></div>
            <div class="hero-hud-corners">
                <span></span><span></span><span></span><span></span>
            </div>
        </div>
        ${reduced ? "" : '<div class="hero-hud-scanner" aria-hidden="true"></div>'}

        <header class="hero-hud-header">
            <p class="hero-hud-kicker">Sistema Akira</p>
            <h1 class="hero-hud-title">AKIRA<span>SCAN</span></h1>
            <p class="hero-hud-sub">アキラ・スキャン — Monitoramento em tempo real</p>
        </header>

        <div class="hero-hud-layout">
            <aside class="hero-hud-panel hero-hud-panel-left" aria-label="Conexões ativas">
                <h2 class="hero-hud-panel-title">PESSOAS CONECTADAS</h2>
                ${statRow("👥", "Usuários online", 0, "usersOnline")}
                ${statRow("📖", "Leitores ativos", 0, "activeReaders")}
                ${statRow("🌎", "Países conectados", 0, "countries")}
            </aside>

            <div class="hero-hud-center">
                ${globeInner}
                <div class="hero-hud-actions">
                    <a href="${linkBiblioteca()}" class="btn-akira btn-akira-primary hero-hud-btn-main">Explorar Biblioteca</a>
                    <a href="${linkBiblioteca({ sort: "recentes" })}" class="btn-akira btn-akira-ghost hero-hud-btn-sub">Lançamentos</a>
                </div>
                <p class="hero-hud-status">
                    <span class="hero-hud-status-dot"></span>
                    AKIRA-SCAN — SUA JORNADA COMEÇA AQUI
                </p>
            </div>

            <aside class="hero-hud-panel hero-hud-panel-right" aria-label="Estatísticas da plataforma">
                <h2 class="hero-hud-panel-title">ESTATÍSTICAS</h2>
                ${statRow("📚", "Mangás", 0, "mangas")}
                ${statRow("📄", "Capítulos", 0, "chapters")}
                ${statRow("👤", "Usuários", 0, "users")}
                ${statRow("👁️", "Visitas hoje", 0, "visitsToday")}
                <div class="hero-hud-stat hero-hud-stat-wide" data-stat="topManga">
                    <span class="hero-hud-stat-icon" aria-hidden="true">🔥</span>
                    <div class="hero-hud-stat-body">
                        <span class="hero-hud-stat-label">Mangá mais lido</span>
                        <strong class="hero-hud-stat-text" data-value="">—</strong>
                    </div>
                </div>
                ${statRow("⭐", "Avaliação", 0, "rating")}
            </aside>
        </div>
    </section>`;
}

function animateCounter(el, target, duration = 1600) {
    const end = Number(target) || 0;
    const isRating = el.closest('[data-stat="rating"]');
    const gen = (counterGens.get(el) || 0) + 1;
    counterGens.set(el, gen);
    const start = performance.now();

    const step = (now) => {
        if (counterGens.get(el) !== gen) return;
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const current = end * eased;
        el.textContent = isRating ? current.toFixed(1) : fmtNum(current);
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = isRating ? end.toFixed(1) : fmtNum(end);
    };
    requestAnimationFrame(step);
}

function updateStatsPanel(root, stats) {
    const map = {
        usersOnline: stats.usersOnline,
        activeReaders: stats.activeReaders,
        countries: stats.countries,
        mangas: stats.mangas,
        chapters: stats.chapters,
        users: stats.users,
        visitsToday: stats.visitsToday,
        rating: stats.rating
    };

    for (const [key, value] of Object.entries(map)) {
        const row = root.querySelector(`[data-stat="${key}"] .hero-hud-stat-value`);
        if (!row) continue;
        const prev = row.dataset.value;
        const next = String(value);
        if (prev === next) continue;
        row.dataset.value = next;
        if (prefersReducedMotion()) {
            row.textContent = key === "rating" ? Number(value).toFixed(1) : fmtNum(value);
        } else {
            animateCounter(row, value, 1200);
        }
    }

    const topEl = root.querySelector('[data-stat="topManga"] .hero-hud-stat-text');
    if (topEl && stats.topManga && topEl.dataset.value !== stats.topManga) {
        topEl.textContent = stats.topManga;
        topEl.dataset.value = stats.topManga;
        topEl.title = stats.topManga;
    }
}

function runInitSequence(root) {
    animTimers.forEach(clearTimeout);
    animTimers = [];

    if (prefersReducedMotion()) {
        root.classList.add("hero-hud-ready");
        return;
    }

    animTimers.push(setTimeout(() => root.classList.add("hero-hud-booting"), 100));
    animTimers.push(setTimeout(() => {
        root.classList.remove("hero-hud-init");
        root.classList.add("hero-hud-ready");
    }, 2400));
}

export async function mountHeroPlanet(slotId = "hero-planet-slot", opts = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    destroyHeroPlanet();

    const useWebGL = supportsWebGL() && !prefersReducedMotion();
    slot.innerHTML = renderHudShell(useWebGL ? "webgl" : "css");
    const hud = slot.querySelector(".hero-hud");
    if (!hud) return;

    runInitSequence(hud);

    const unsub = await observarStatsLive((stats) => {
        updateStatsPanel(hud, stats);
    }, opts.catalogo || []);
    statsUnsub = typeof unsub === "function" ? unsub : null;

    if (!useWebGL) return;

    try {
        const { initPlanetCanvas } = await Promise.race([
            import("../dist/client/components/hero-planet-three.js"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Three.js timeout")), 10000))
        ]);
        const canvas = hud.querySelector("#hero-webgl-canvas");
        const wrap = hud.querySelector("#hero-hud-globe");
        if (canvas && wrap) {
            sceneHandle = await initPlanetCanvas(canvas, wrap);
        }
    } catch (err) {
        console.warn("[HeroHUD] WebGL falhou:", err.message);
        const globe = hud.querySelector("#hero-hud-globe");
        if (globe) {
            globe.outerHTML = `
            <div class="hero-hud-globe-wrap hero-hud-globe-fallback" aria-hidden="true">
                <div class="planet-orbit planet-orbit-ambient">
                    <div class="planet-3d"><div class="planet-sphere"></div><div class="planet-atmosphere"></div></div>
                </div>
            </div>`;
        }
    }
}

export function destroyHeroPlanet() {
    sceneHandle?.destroy?.();
    sceneHandle = null;
    if (typeof statsUnsub === "function") statsUnsub();
    statsUnsub = null;
    animTimers.forEach(clearTimeout);
    animTimers = [];
}

/** @deprecated */
export function renderHeroPlanet() {
    return renderHudShell("css");
}
