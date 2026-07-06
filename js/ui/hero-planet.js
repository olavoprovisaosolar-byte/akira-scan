/**
 * Hero Section — logo oficial + planeta 3D (Three.js) com fallback CSS.
 */
import { renderLogo } from "../brand.js";
import { linkBiblioteca } from "../core/router.js";

let sceneHandle = null;

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

function renderCssPlanet() {
    return `
    <div class="planet-orbit planet-orbit-ambient" aria-hidden="true">
        <div class="planet-3d planet-3d-sm">
            <div class="planet-sphere"></div>
            <div class="planet-atmosphere"></div>
        </div>
    </div>`;
}

function renderWebGLShell() {
    return `
    <div class="hero-webgl-wrap" aria-hidden="true">
        <canvas class="hero-webgl-canvas" id="hero-webgl-canvas"></canvas>
        <div class="hero-webgl-glow"></div>
    </div>`;
}

function renderHeroShell(mode) {
    const visual = mode === "webgl" ? renderWebGLShell() : renderCssPlanet();
    return `
    <section class="hero-planet hero-brand" aria-label="Bem-vindo ao AkiraScan">
        <div class="hero-planet-bg"></div>
        <div class="hero-brand-glow" aria-hidden="true"></div>
        <div class="hero-planet-layout hero-brand-layout">
            <div class="hero-brand-visual">
                ${visual}
                ${renderLogo("hero")}
            </div>
            <div class="hero-planet-content hero-brand-actions">
                <div class="hero-actions">
                    <a href="${linkBiblioteca()}" class="btn-akira btn-akira-primary">Explorar biblioteca</a>
                    <a href="${linkBiblioteca({ sort: "popular" })}" class="btn-akira btn-akira-ghost">Populares</a>
                </div>
            </div>
        </div>
    </section>`;
}

export async function mountHeroPlanet(slotId = "hero-planet-slot") {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    sceneHandle?.destroy?.();
    sceneHandle = null;

    const useWebGL = supportsWebGL() && !prefersReducedMotion();
    slot.innerHTML = renderHeroShell(useWebGL ? "webgl" : "css");

    if (!useWebGL) return;

    try {
        const { initPlanetCanvas } = await Promise.race([
            import("../dist/client/components/hero-planet-three.js"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Three.js timeout")), 8000))
        ]);
        const canvas = slot.querySelector("#hero-webgl-canvas");
        const wrap = slot.querySelector(".hero-webgl-wrap");
        if (canvas && wrap) {
            sceneHandle = await initPlanetCanvas(canvas, wrap);
        }
    } catch (err) {
        console.warn("[HeroPlanet] WebGL falhou, fallback CSS:", err.message);
        slot.innerHTML = renderHeroShell("css");
    }
}

export function destroyHeroPlanet() {
    sceneHandle?.destroy?.();
    sceneHandle = null;
}

/** @deprecated use mountHeroPlanet */
export function renderHeroPlanet() {
    return renderHeroShell("css");
}
