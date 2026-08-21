/**
 * Shell compartilhado — header, footer, busca inteligente, tema.
 */
import { avisoSeArquivoLocal } from "./servidor.js";
import { initTema } from "./theme.js";
import { BRAND, renderLogo, injectBrandMeta } from "./brand.js";
import { registerServiceWorker } from "./sw-register.js";
import { injectHeadOptimizations } from "./head-optimizations.js";
import { sincronizarComNuvem, ehFavorito, alternarFavorito } from "./storage.js";
import { linkManhwa } from "./core/router.js";
import { initBottomNav } from "./ui/bottom-nav.js";
import { coverImgTagAttrs, installCoverFallbackHandler } from "./services/cover-utils.js";
import { slugGenero } from "./services/genre-utils.js";

export function escHtml(t = "") {
    return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function paginaAtual() {
    const path = (location.pathname || "/").replace(/\/+$/, "") || "/";
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "obra") {
        return parts.length >= 3 ? "leitor.html" : "index.html";
    }
    const raw = (parts[parts.length - 1] || "").replace(/\/+$/, "");
    if (!raw || raw === "index") return "index.html";
    return raw.endsWith(".html") ? raw : `${raw}.html`;
}

export function paginaAtiva(path) {
    return paginaAtual() === path ? " ativo" : "";
}

export function renderHeader({ busca = true, buscaValor = "" } = {}) {
    return `
    <header class="akira-header akira-topbar">
        <a href="index.html" class="akira-logo" aria-label="${escHtml(BRAND.displayName)}">
            <span class="akira-logo-mark" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </span>
            ${renderLogo("header")}
        </a>

        <div class="akira-topbar-spacer" aria-hidden="true"></div>

        <div class="akira-topbar-actions">
            ${busca ? `
            <button type="button" class="akira-icon-btn" id="header-search-btn" title="Buscar" aria-label="Buscar" aria-expanded="false" aria-controls="akira-search-form">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            </button>` : ""}
            <button type="button" class="akira-icon-btn" id="header-theme-btn" title="Aparência" aria-label="Aparência">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            </button>
            <a href="atualizacoes.html" class="akira-icon-btn" id="header-notif-btn" title="Notificações" aria-label="Notificações">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
                <span class="notif-badge escondido" id="header-notif-badge" aria-hidden="true"></span>
            </a>
            <span class="akira-topbar-divider" aria-hidden="true"></span>
            <a href="perfil.html" class="akira-topbar-avatar" id="header-avatar-link" title="Perfil" aria-label="Perfil">
                <img id="header-avatar" alt="" width="32" height="32" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%231a1a1a'/%3E%3Ccircle cx='32' cy='24' r='10' fill='%23a855f7'/%3E%3Cpath d='M10 56c4-12 14-18 22-18s18 6 22 18' fill='%23a855f7'/%3E%3C/svg%3E">
            </a>
            <a href="login.html" class="akira-icon-btn akira-topbar-auth" id="header-auth-btn" title="Entrar" aria-label="Entrar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>
            </a>
            <button type="button" class="menu-toggle" id="menu-toggle" aria-label="Abrir menu" aria-controls="akira-nav" aria-expanded="false">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
        </div>

        ${busca ? `
        <form class="akira-search akira-search-panel escondido" id="akira-search-form" action="biblioteca.html" method="get" role="search" autocomplete="off">
            <span class="akira-search-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            </span>
            <input type="search" name="q" id="akira-search-input" placeholder="Buscar mangá, autor, gênero..." value="${escHtml(buscaValor)}" aria-label="Buscar" aria-autocomplete="list" aria-controls="akira-search-suggestions">
            <button type="button" class="akira-search-close" id="akira-search-close" aria-label="Fechar busca">✕</button>
            <div class="akira-search-suggestions escondido" id="akira-search-suggestions" role="listbox"></div>
        </form>` : ""}

        <nav class="akira-nav" id="akira-nav" aria-label="Menu principal">
            <div class="akira-nav-head">
                <span class="akira-nav-title">Menu</span>
                <button type="button" class="akira-nav-close" id="nav-close" aria-label="Fechar menu">✕</button>
            </div>
            <a href="index.html" class="${paginaAtiva("index.html").trim()}"><span class="nav-icon">🏠</span> Início</a>
            <a href="atualizacoes.html" class="${paginaAtiva("atualizacoes.html").trim()}"><span class="nav-icon">📡</span> Atualizações</a>
            <a href="biblioteca.html" class="${paginaAtiva("biblioteca.html").trim()}"><span class="nav-icon">📚</span> Biblioteca</a>
            <a href="ranking.html" class="${paginaAtiva("ranking.html").trim()}"><span class="nav-icon">🏆</span> Ranking</a>
            <a href="historico.html" class="${paginaAtiva("historico.html").trim()}"><span class="nav-icon">📜</span> Histórico</a>
            <a href="biblioteca.html?q=favoritos"><span class="nav-icon">💖</span> Favoritos</a>
            <a href="perfil.html" class="${paginaAtiva("perfil.html").trim()}"><span class="nav-icon">👤</span> Perfil</a>
            <div class="akira-nav-divider" role="separator"></div>
            <p class="akira-nav-section-label">Atalhos</p>
            <a href="biblioteca.html?sort=popular"><span class="nav-icon">🔥</span> Populares</a>
            <a href="biblioteca.html?sort=recentes"><span class="nav-icon">✨</span> Recentes</a>
            <a href="biblioteca.html?sort=rating"><span class="nav-icon">★</span> Melhor nota</a>
            <a href="login.html" class="${paginaAtiva("login.html").trim()}"><span class="nav-icon">🔐</span> Entrar</a>
        </nav>
    </header>`;
}

export function renderFooter() {
    const year = new Date().getFullYear();
    return `
    <footer class="akira-footer akira-footer-rich">
        <div class="footer-grid container">
            <div class="footer-brand">
                ${renderLogo("footer")}
                <p>${escHtml(BRAND.tagline)}</p>
                <p class="footer-tag">Leitura premium · Catálogo NexusToons · CDN Discord</p>
            </div>
            <div class="footer-col">
                <h4>Navegar</h4>
                <a href="index.html">Início</a>
                <a href="biblioteca.html">Biblioteca</a>
                <a href="ranking.html">Ranking</a>
                <a href="atualizacoes.html">Atualizações</a>
                <a href="historico.html">Histórico</a>
            </div>
            <div class="footer-col">
                <h4>Explorar</h4>
                <a href="biblioteca.html?sort=popular">Populares</a>
                <a href="biblioteca.html?sort=recentes">Recentes</a>
                <a href="biblioteca.html?genero=acao">Ação</a>
                <a href="biblioteca.html?genero=romance">Romance</a>
            </div>
            <div class="footer-col">
                <h4>Conta</h4>
                <a href="perfil.html">Perfil</a>
                <a href="login.html">Entrar</a>
            </div>
        </div>
        <div class="footer-bottom">
            <span>© ${year} ${escHtml(BRAND.displayName)}</span>
            <span class="footer-dot">·</span>
            <span>Feito para leitores de scan</span>
        </div>
    </footer>`;
}

export async function initShell() {
    injectBrandMeta();
    injectHeadOptimizations();
    injectAmbientBackground();
    installCoverFallbackHandler();
    initTema();

    const toggle = document.getElementById("menu-toggle");
    const nav = document.getElementById("akira-nav");
    initMobileNav(toggle, nav);
    initTopbarChrome();
    initBottomNav();
    registerServiceWorker();

    await initBuscaInteligente();
    bindCardBookmarks();
    import("./services/fav-updates.js").then((m) => m.initNotifBadge()).catch(() => {});

    sincronizarComNuvem().then(() => {
        import("./storage.js").then(({ obterPerfil }) => {
            const avatar = document.getElementById("header-avatar");
            const perfil = obterPerfil();
            if (avatar && perfil.avatar) avatar.src = perfil.avatar;
        }).catch(() => {});
    }).catch(() => {});

    const aviso = avisoSeArquivoLocal();
    if (aviso) {
        const slot = document.getElementById("aviso-servidor");
        if (slot) slot.innerHTML = aviso;
    }
}

function injectAmbientBackground() {
    if (document.getElementById("akira-ambient")) return;
    if (!document.body.classList.contains("akira-app")) return;
    const el = document.createElement("div");
    el.id = "akira-ambient";
    el.className = "akira-ambient";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
        <div class="akira-ambient-grid"></div>
        <div class="akira-ambient-orb akira-ambient-orb-1"></div>
        <div class="akira-ambient-orb akira-ambient-orb-2"></div>`;
    document.body.prepend(el);
}

function initTopbarChrome() {
    const searchBtn = document.getElementById("header-search-btn");
    const searchForm = document.getElementById("akira-search-form");
    const searchInput = document.getElementById("akira-search-input");
    const searchClose = document.getElementById("akira-search-close");
    const header = document.querySelector(".akira-header");

    const openSearch = () => {
        if (!searchForm) return;
        searchForm.classList.remove("escondido");
        header?.classList.add("search-open");
        searchBtn?.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => searchInput?.focus());
    };
    const closeSearch = () => {
        if (!searchForm) return;
        searchForm.classList.add("escondido");
        header?.classList.remove("search-open");
        searchBtn?.setAttribute("aria-expanded", "false");
        document.getElementById("akira-search-suggestions")?.classList.add("escondido");
    };

    searchBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        searchForm?.classList.contains("escondido") ? openSearch() : closeSearch();
    });
    searchClose?.addEventListener("click", (e) => {
        e.preventDefault();
        closeSearch();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && header?.classList.contains("search-open")) closeSearch();
    });
    document.addEventListener("click", (e) => {
        if (!header?.classList.contains("search-open")) return;
        const t = e.target;
        if (searchForm?.contains(t) || searchBtn?.contains(t)) return;
        closeSearch();
    });

    document.getElementById("header-theme-btn")?.addEventListener("click", () => {
        sessionStorage.setItem("akira_open_config", "1");
        if (paginaAtual() === "perfil.html") {
            const settings = document.getElementById("perfil-settings");
            if (settings) {
                settings.hidden = false;
                sessionStorage.removeItem("akira_open_config");
                settings.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
        }
        location.href = "perfil.html";
    });

    Promise.all([
        import("./storage.js"),
        import("./local-auth.js"),
        import("./user-api.js")
    ]).then(([{ obterPerfil }, { lerSessaoLocal, sairLocal }, { temSessaoApi, apiSair }]) => {
        const perfil = obterPerfil();
        const sess = lerSessaoLocal();
        const logged = Boolean(temSessaoApi() || sess);
        const avatar = document.getElementById("header-avatar");
        const authBtn = document.getElementById("header-auth-btn");
        const navLogin = document.querySelector('#akira-nav a[href="login.html"]');

        if (avatar && perfil.avatar) avatar.src = perfil.avatar;

        if (logged && navLogin) {
            navLogin.innerHTML = `<span class="nav-icon">🚪</span> Sair`;
            navLogin.href = "#";
            navLogin.addEventListener("click", async (e) => {
                e.preventDefault();
                try { await apiSair(); } catch { /* ignore */ }
                sairLocal();
                location.href = "index.html";
            });
        }

        if (!authBtn) return;
        if (logged) {
            authBtn.href = "#";
            authBtn.title = "Sair";
            authBtn.setAttribute("aria-label", "Sair");
            authBtn.classList.add("is-logout");
            authBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>`;
            authBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                try { await apiSair(); } catch { /* ignore */ }
                sairLocal();
                location.href = "index.html";
            });
        } else {
            authBtn.href = "login.html";
            authBtn.classList.remove("is-logout");
        }
    }).catch(() => {});
}

function initMobileNav(toggle, nav) {
    if (!toggle || !nav) return;

    const header = toggle.closest(".akira-header") || document.querySelector(".akira-header");

    let backdrop = document.getElementById("nav-backdrop");
    if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = "nav-backdrop";
        backdrop.className = "nav-backdrop escondido";
        backdrop.setAttribute("aria-hidden", "true");
        document.body.appendChild(backdrop);
    }

    const isMobile = () => true; // topbar limpa: nav sempre em drawer

    const placeNav = () => {
        if (!header) return;
        nav.classList.add("akira-nav-drawer");
        if (nav.parentElement !== document.body) {
            document.body.appendChild(nav);
        }
    };

    const fechar = () => {
        nav.classList.remove("aberto");
        backdrop.classList.add("escondido");
        backdrop.setAttribute("aria-hidden", "true");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Abrir menu");
        document.body.classList.remove("nav-aberta");
    };

    const abrir = () => {
        placeNav();
        nav.classList.add("aberto");
        backdrop.classList.remove("escondido");
        backdrop.setAttribute("aria-hidden", "false");
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "Fechar menu");
        document.body.classList.add("nav-aberta");
        document.getElementById("nav-close")?.focus({ preventScroll: true });
    };

    placeNav();

    toggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        nav.classList.contains("aberto") ? fechar() : abrir();
    });

    document.getElementById("nav-close")?.addEventListener("click", (e) => {
        e.preventDefault();
        fechar();
    });
    backdrop.addEventListener("click", fechar);
    nav.addEventListener("click", (e) => {
        const link = e.target.closest("a");
        if (link) fechar();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") fechar();
    });

    window.addEventListener("resize", () => {
        placeNav();
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

export function renderMangaCard(manga, { badge = "", novo = false, overlay = false, rich = true } = {}) {
    const accent = manga.accent || `hsl(${hashHue(manga.id)}, 72%, 52%)`;
    const id = escHtml(manga.id);
    const img = coverImgTagAttrs(manga, { loading: "lazy" });
    const prontos = Number(manga.syncProntos);
    const total = Number(manga.totalCapitulos || manga.capitulos?.length || 0);
    const syncBadge = Number.isFinite(prontos) && total > 0
        ? `<span class="manga-card-sync">${prontos}/${total}</span>`
        : "";
    const novoBadge = novo ? `<span class="manga-card-badge manga-card-badge-new">NOVO</span>` : "";
    const rating = manga.nexusRating ? `<span class="manga-card-rating">★ ${Number(manga.nexusRating).toFixed(1)}</span>` : "";
    const status = manga.status ? `<span class="manga-card-status">${escHtml(manga.status)}</span>` : "";
    const meta = escHtml((manga.generos || []).slice(0, 2).join(" · ") || manga.nexusType || "Mangá");
    const richMeta = rich && overlay ? `
            <div class="manga-card-rich-meta">
                ${total ? `<span>${total} caps</span>` : ""}
                ${manga.autor ? `<span>${escHtml(manga.autor.split(",")[0].slice(0, 18))}</span>` : ""}
            </div>` : "";

    const saved = ehFavorito(manga.id);
    const bookmark = `<button type="button" class="manga-card-bookmark${saved ? " is-on" : ""}" data-bookmark="${id}" aria-label="${saved ? "Remover dos favoritos" : "Adicionar aos favoritos"}">${saved ? "♥" : "♡"}</button>`;

    if (overlay) {
        return `
    <a href="${linkManhwa(manga.id)}" class="manga-card manga-card-overlay-style" style="--card-accent:${accent}" data-manga-id="${id}">
        <div class="manga-card-capa">
            <img ${img.html}>
            ${bookmark}
            ${badge ? `<span class="manga-card-badge">${escHtml(badge)}</span>` : ""}
            ${novoBadge}${rating}${status}${syncBadge}
            <div class="manga-card-shine" aria-hidden="true"></div>
            <div class="manga-card-overlay">
                <h3>${escHtml(manga.titulo)}</h3>
                <p>${meta}</p>
                ${richMeta}
            </div>
        </div>
    </a>`;
    }

    return `
    <a href="${linkManhwa(manga.id)}" class="manga-card manga-card-classic" style="--card-accent:${accent}" data-manga-id="${id}">
        <div class="manga-card-capa">
            <img ${img.html}>
            ${bookmark}
            ${badge ? `<span class="manga-card-badge">${escHtml(badge)}</span>` : ""}
            ${novoBadge}${rating}${status}${syncBadge}
        </div>
        <div class="manga-card-info">
            <h3>${escHtml(manga.titulo)}</h3>
            <p>${meta}${manga.nexusRating ? ` · ★ ${Number(manga.nexusRating).toFixed(1)}` : ""}</p>
        </div>
    </a>`;
}

export function renderFavoritoCard(manga, historico = null) {
    const accent = manga.accent || `hsl(${hashHue(manga.id)}, 72%, 52%)`;
    const img = coverImgTagAttrs(manga, { loading: "lazy" });
    const hist = historico || {};
    const cap = hist.capitulo_atual ? `Cap. ${hist.capitulo_atual}` : "Não iniciado";
    const pct = hist.progresso ? Math.min(100, hist.progresso) : 0;
    return `
    <a href="${linkManhwa(manga.id)}" class="fav-card" style="--card-accent:${accent}" data-manga-id="${escHtml(manga.id)}">
        <div class="fav-card-capa">
            <img ${img.html}>
            <span class="fav-card-cap">${escHtml(cap)}</span>
        </div>
        <div class="fav-card-body">
            <h3>${escHtml(manga.titulo)}</h3>
            ${pct > 0 ? `<div class="fav-card-progress"><span style="width:${pct}%"></span></div>` : ""}
        </div>
    </a>`;
}

function hashHue(id = "") {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) >>> 0;
    return h % 360;
}

function bindCardBookmarks() {
    if (document.documentElement.dataset.bookmarkBound) return;
    document.documentElement.dataset.bookmarkBound = "1";
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-bookmark]");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.bookmark;
        if (!id) return;
        const on = alternarFavorito(id);
        btn.classList.toggle("is-on", on);
        btn.textContent = on ? "♥" : "♡";
        btn.setAttribute("aria-label", on ? "Remover dos favoritos" : "Adicionar aos favoritos");
    }, true);
}

export function renderSidebarGeneros(generos, ativo = "", sort = "az") {
    const ativos = String(ativo).split(/[,|]/).map((g) => slugGenero(g)).filter(Boolean);
    const chips = generos.map((g) =>
        `<a href="biblioteca.html?genero=${encodeURIComponent(g)}" class="genre-chip${ativos.includes(slugGenero(g)) ? " ativo" : ""}">${escHtml(g)}</a>`
    ).join("");
    const sortPopular = sort === "popular" ? " ativo" : "";
    const sortRecentes = sort === "recentes" ? " ativo" : "";
    const sortAz = sort === "az" || !sort ? " ativo" : "";
    return `
    <aside class="akira-sidebar">
        <div class="sidebar-block">
            <h3>Gêneros</h3>
            <div class="genre-list">${chips}</div>
        </div>
        <div class="sidebar-block">
            <h3>Explorar</h3>
            <div class="genre-list">
                <a href="biblioteca.html?sort=popular" class="genre-chip${sortPopular}">Populares</a>
                <a href="biblioteca.html?sort=recentes" class="genre-chip${sortRecentes}">Recentes</a>
                <a href="biblioteca.html?sort=az" class="genre-chip${sortAz}">A–Z</a>
            </div>
        </div>
    </aside>
    <div class="akira-filters-mobile" aria-label="Filtros">
        <a href="biblioteca.html?sort=popular" class="genre-chip${sortPopular}">Populares</a>
        <a href="biblioteca.html?sort=recentes" class="genre-chip${sortRecentes}">Recentes</a>
        <a href="biblioteca.html?sort=az" class="genre-chip${sortAz}">A–Z</a>
        ${chips}
    </div>`;
}

export function renderRankingItem(manga) {
    const img = coverImgTagAttrs(manga, { loading: "lazy" });
    const medal = manga.rank === 1 ? "🥇" : manga.rank === 2 ? "🥈" : manga.rank === 3 ? "🥉" : "";
    return `
    <a href="${linkManhwa(manga.id)}" class="ranking-item" data-manga-id="${escHtml(manga.id)}">
        <span class="ranking-pos">${medal || manga.rank}</span>
        <img ${img.html}>
        <div class="ranking-info">
            <strong>${escHtml(manga.titulo)}</strong>
            <span>${escHtml((manga.generos || []).slice(0, 2).join(" · ") || manga.status || "")}</span>
        </div>
        <span class="ranking-score">${Math.round(manga.popularidade || 0)}</span>
    </a>`;
}
