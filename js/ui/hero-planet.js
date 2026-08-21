/**
 * Hero HUD — marca + CTAs da home.
 */
import { linkBiblioteca } from "../core/router.js";

let animTimers = [];

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function renderHudShell() {
    const reduced = prefersReducedMotion();
    return `
    <section class="hero-hud${reduced ? " hero-hud-reduced" : " hero-hud-init"}" aria-label="AkiraScan">
        <div class="hero-hud-bg" aria-hidden="true">
            <div class="hero-hud-grid"></div>
            <div class="hero-hud-noise"></div>
            <div class="hero-hud-frame"></div>
            <div class="hero-hud-corners"><span></span><span></span><span></span><span></span></div>
        </div>
        ${reduced ? "" : '<div class="hero-hud-scanner" aria-hidden="true"></div>'}
        <header class="hero-hud-header">
            <h1 class="hero-hud-title">AKIRA-SCAN</h1>
            <p class="hero-hud-sub">アキラ・スキャン</p>
        </header>
        <div class="hero-hud-layout">
            <div class="hero-hud-center">
                <nav class="hero-hud-actions" aria-label="Ações rápidas">
                    <a href="${linkBiblioteca()}" class="btn-akira btn-akira-primary hero-hud-btn-main">Explorar Biblioteca</a>
                    <a href="${linkBiblioteca({ sort: "recentes" })}" class="btn-akira btn-akira-ghost hero-hud-btn-sub">Lançamentos</a>
                </nav>
                <p class="hero-hud-status">
                    <span class="hero-hud-status-dot"></span>
                    AKIRA-SCAN - SUA JORNADA COMEÇA AQUI
                </p>
            </div>
        </div>
    </section>`;
}

function runInitSequence(root) {
    animTimers.forEach(clearTimeout);
    animTimers = [];
    if (prefersReducedMotion()) {
        root.classList.add("hero-hud-ready");
        return;
    }
    animTimers.push(setTimeout(() => root.classList.add("hero-hud-booting"), 80));
    animTimers.push(setTimeout(() => {
        root.classList.remove("hero-hud-init");
        root.classList.add("hero-hud-ready");
    }, 2000));
}

export async function mountHeroPlanet(slotId = "hero-planet-slot") {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    destroyHeroPlanet();

    slot.innerHTML = renderHudShell();
    const hud = slot.querySelector(".hero-hud");
    if (!hud) return;

    runInitSequence(hud);
}

export function destroyHeroPlanet() {
    animTimers.forEach(clearTimeout);
    animTimers = [];
}

export function renderHeroPlanet() {
    return renderHudShell();
}
