/** Carrossel de destaques na home */
import { escHtml } from "./app-shell.js";
import { linkManhwa } from "./core/router.js";
import { bannerImgTagAttrs, installCoverFallbackHandler } from "./services/cover-utils.js";

export function initCarousel(containerId, mangas = []) {
    installCoverFallbackHandler();
    const root = document.getElementById(containerId);
    const track = document.getElementById("hero-track");
    const dots = document.getElementById("hero-dots");
    if (!root || !track || !mangas.length) {
        root?.classList.add("hero-carousel-empty");
        return;
    }

    track.innerHTML = mangas.map((m, i) => `
        <article class="hero-slide${i === 0 ? " ativo" : ""}" data-index="${i}">
            <img ${bannerImgTagAttrs(m, { loading: i === 0 ? "eager" : "lazy" })}>
            <div class="hero-slide-overlay"></div>
            <div class="hero-slide-content">
                <span class="hero-slide-tag">Destaque #${i + 1}</span>
                <h1>${escHtml(m.titulo)}</h1>
                <p>${escHtml((m.sinopse || "").slice(0, 140))}${(m.sinopse || "").length > 140 ? "…" : ""}</p>
                <div class="hero-slide-meta">
                    ${(m.generos || []).slice(0, 3).map((g) => `<span class="meta-tag">${escHtml(g)}</span>`).join("")}
                </div>
                <a href="${linkManhwa(m.id)}" class="btn-akira btn-akira-primary">Ler agora</a>
            </div>
        </article>`).join("");

    dots.innerHTML = mangas.map((_, i) =>
        `<button type="button" class="hero-dot${i === 0 ? " ativo" : ""}" data-index="${i}" aria-label="Slide ${i + 1}"></button>`
    ).join("");

    let atual = 0;
    let timer = null;

    const ir = (idx) => {
        atual = (idx + mangas.length) % mangas.length;
        track.querySelectorAll(".hero-slide").forEach((el, i) => el.classList.toggle("ativo", i === atual));
        dots.querySelectorAll(".hero-dot").forEach((el, i) => el.classList.toggle("ativo", i === atual));
    };

    const next = () => ir(atual + 1);
    const prev = () => ir(atual - 1);

    document.getElementById("hero-next")?.addEventListener("click", () => { next(); resetTimer(); });
    document.getElementById("hero-prev")?.addEventListener("click", () => { prev(); resetTimer(); });
    dots.querySelectorAll(".hero-dot").forEach((btn) => {
        btn.addEventListener("click", () => {
            ir(Number(btn.dataset.index));
            resetTimer();
        });
    });

    function resetTimer() {
        clearInterval(timer);
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        timer = setInterval(next, 6000);
    }

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        resetTimer();
        root.addEventListener("mouseenter", () => clearInterval(timer));
        root.addEventListener("mouseleave", resetTimer);
    }
}
