/**
 * Shell compartilhado — header, footer, busca inteligente, tema.
 */
import { avisoSeArquivoLocal } from "./servidor.js";
import { initTema, alternarTema, temaAtual } from "./theme.js";
import { BRAND, renderLogo, injectBrandMeta } from "./brand.js";
import { registerServiceWorker } from "./sw-register.js";
import { injectHeadOptimizations } from "./head-optimizations.js";
import { linkManhwa } from "./core/router.js";
import { coverImgTagAttrs, installCoverFallbackHandler } from "./services/cover-utils.js";

export function escHtml(t = "") {
    return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function paginaAtiva(path) {
    const p = location.pathname.split("/").pop() || "index.html";
    return p === path ? " ativo" : "";
}

export function renderHeader({ busca = true, buscaValor = "" } = {}) {
    return `
    <header class="akira-header">
        <a href="index.html" class="akira-logo" aria-label="${escHtml(BRAND.displayName)}">
            ${renderLogo("header")}
        </a>
        ${busca ? `
        <form class="akira-search" id="akira-search-form" action="biblioteca.html" method="get" role="search" autocomplete="off">
            <span class="akira-search-icon">🔍</span>
            <input type="search" name="q" id="akira-search-input" placeholder="Buscar mangá, autor, gênero..." value="${escHtml(buscaValor)}" aria-label="Buscar" aria-autocomplete="list" aria-controls="akira-search-suggestions">
            <div class="akira-search-suggestions escondido" id="akira-search-suggestions" role="listbox"></div>
        </form>` : ""}
        <button class="btn-theme-toggle" id="btn-theme" type="button" aria-label="Alternar tema" title="Tema claro/escuro">🌙</button>
        <button class="menu-toggle" id="menu-toggle" type="button" aria-label="Menu">☰</button>
        <nav class="akira-nav" id="akira-nav">
            <a href="index.html" class="${paginaAtiva("index.html").trim()}">Início</a>
            <a href="biblioteca.html" class="${paginaAtiva("biblioteca.html").trim()}">Biblioteca</a>
            <a href="biblioteca.html?q=favoritos">Favoritos</a>
            <a href="perfil.html" class="${paginaAtiva("perfil.html").trim()}">Perfil</a>
        </nav>
    </header>`;
}

export function renderFooter() {
    return `
    <footer class="akira-footer">
        ${renderLogo("footer")}
        <p>${escHtml(BRAND.tagline)}</p>
    </footer>`;
}

export async function initShell() {
    injectBrandMeta();
    injectHeadOptimizations();
    installCoverFallbackHandler();
    initTema();
    atualizarIconeTema();

    document.getElementById("btn-theme")?.addEventListener("click", () => {
        alternarTema();
        atualizarIconeTema();
    });

    const toggle = document.getElementById("menu-toggle");
    const nav = document.getElementById("akira-nav");
    initMobileNav(toggle, nav);
    registerServiceWorker();

    await initBuscaInteligente();

    const aviso = avisoSeArquivoLocal();
    if (aviso) {
        const slot = document.getElementById("aviso-servidor");
        if (slot) slot.innerHTML = aviso;
    }
}

function atualizarIconeTema() {
    const btn = document.getElementById("btn-theme");
    if (btn) btn.textContent = temaAtual() === "dark" ? "🌙" : "☀️";
}

function initMobileNav(toggle, nav) {
    if (!toggle || !nav) return;

    let backdrop = document.getElementById("nav-backdrop");
    if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = "nav-backdrop";
        backdrop.className = "nav-backdrop escondido";
        backdrop.setAttribute("aria-hidden", "true");
        document.body.appendChild(backdrop);
    }

    const fechar = () => {
        nav.classList.remove("aberto");
        backdrop.classList.add("escondido");
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("nav-aberta");
    };

    const abrir = () => {
        nav.classList.add("aberto");
        backdrop.classList.remove("escondido");
        toggle.setAttribute("aria-expanded", "true");
        document.body.classList.add("nav-aberta");
    };

    toggle.addEventListener("click", () => {
        nav.classList.contains("aberto") ? fechar() : abrir();
    });

    backdrop.addEventListener("click", fechar);
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", fechar));

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") fechar();
    });
}

async function initBuscaInteligente() {
    const input = document.getElementById("akira-search-input");
    const box = document.getElementById("akira-search-suggestions");
    const form = document.getElementById("akira-search-form");
    if (!input || !box) return;

    let timer = null;
    let catalogo = [];
    let catalogoPromise = null;

    const loadCatalogo = () => {
        if (catalogo.length) return Promise.resolve(catalogo);
        if (!catalogoPromise) {
            catalogoPromise = import("./services/data-service.js")
                .then(({ obterCatalogoCompleto }) => obterCatalogoCompleto())
                .then((lista) => {
                    catalogo = lista || [];
                    return catalogo;
                })
                .catch(() => {
                    catalogo = [];
                    return catalogo;
                });
        }
        return catalogoPromise;
    };

    loadCatalogo().catch(() => {});

    const render = async (termo) => {
        await loadCatalogo();
        const t = termo.trim().toLowerCase();
        if (t.length < 2) {
            box.classList.add("escondido");
            box.innerHTML = "";
            return;
        }
        const hits = catalogo
            .filter((m) => {
                const titulo = (m.titulo || "").toLowerCase();
                const alt = (m.alternativeTitle || m.tituloAlternativo || "").toLowerCase();
                const autor = (m.autor || "").toLowerCase();
                const id = (m.id || "").toLowerCase();
                return titulo.includes(t)
                    || alt.includes(t)
                    || autor.includes(t)
                    || id.includes(t)
                    || (m.generos || []).some((g) => String(g).toLowerCase().includes(t));
            })
            .slice(0, 8);

        if (!hits.length) {
            box.classList.add("escondido");
            return;
        }

        box.innerHTML = hits.map((m) => {
            const img = coverImgTagAttrs(m, { loading: "lazy" });
            return `
            <a href="${linkManhwa(m.id)}" class="search-hit" role="option" data-manga-id="${escHtml(m.id)}">
                <img ${img.html}>
                <span>
                    <strong>${escHtml(m.titulo)}</strong>
                    <small>${escHtml((m.generos || []).slice(0, 2).join(" · ") || m.autor || "Mangá")}</small>
                </span>
            </a>`;
        }).join("");
        box.classList.remove("escondido");
    };

    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => render(input.value), 180);
    });

    input.addEventListener("focus", () => render(input.value));

    document.addEventListener("click", (e) => {
        if (!form?.contains(e.target)) box.classList.add("escondido");
    });

    form?.addEventListener("submit", (e) => {
        if (!input.value.trim()) e.preventDefault();
    });
}

export function renderMangaCard(manga, { badge = "" } = {}) {
    const accent = manga.accent || `hsl(${hashHue(manga.id)}, 72%, 52%)`;
    const id = escHtml(manga.id);
    const img = coverImgTagAttrs(manga, { loading: "lazy" });
    return `
    <a href="${linkManhwa(manga.id)}" class="manga-card" style="--card-accent:${accent}" data-manga-id="${id}">
        <div class="manga-card-capa">
            <img ${img.html}>
            ${badge ? `<span class="manga-card-badge">${escHtml(badge)}</span>` : ""}
        </div>
        <div class="manga-card-info">
            <h3>${escHtml(manga.titulo)}</h3>
            <p>${escHtml((manga.generos || []).slice(0, 2).join(" · ") || manga.status || "Mangá")}</p>
        </div>
    </a>`;
}

function hashHue(id = "") {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) >>> 0;
    return h % 360;
}

export function renderSidebarGeneros(generos, ativo = "") {
    const chips = generos.map((g) =>
        `<a href="biblioteca.html?genero=${encodeURIComponent(g)}" class="genre-chip${ativo === g ? " ativo" : ""}">${escHtml(g)}</a>`
    ).join("");
    return `
    <aside class="akira-sidebar">
        <div class="sidebar-block">
            <h3>Gêneros</h3>
            <div class="genre-list">${chips}</div>
        </div>
        <div class="sidebar-block">
            <h3>Explorar</h3>
            <div class="genre-list">
                <a href="biblioteca.html?sort=popular" class="genre-chip">Populares</a>
                <a href="biblioteca.html?sort=recentes" class="genre-chip">Recentes</a>
                <a href="biblioteca.html?sort=az" class="genre-chip">A–Z</a>
            </div>
        </div>
    </aside>`;
}

export function renderRankingItem(manga) {
    const img = coverImgTagAttrs(manga, { loading: "lazy" });
    return `
    <a href="${linkManhwa(manga.id)}" class="ranking-item" data-manga-id="${escHtml(manga.id)}">
        <span class="ranking-pos">${manga.rank}</span>
        <img ${img.html}>
        <div class="ranking-info">
            <strong>${escHtml(manga.titulo)}</strong>
            <span>${escHtml((manga.generos || []).slice(0, 2).join(" · ") || manga.status || "")}</span>
        </div>
        <span class="ranking-score">${Math.round(manga.popularidade || 0)}</span>
    </a>`;
}
