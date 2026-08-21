/**
 * Controller — página index.html (home + detalhes via router).
 */
import {
    obterCatalogoCompleto,
    obterPopulares,
    obterCapsRecentes,
    obterRankingSemanal,
    listarMangas,
    obterManga,
    linkLeitor,
    numeroCapituloLabel,
    ordenar
} from "../services/data-service.js";
import { renderMangaCard, renderRankingItem, escHtml } from "../app-shell.js";
import { coverImgTagAttrs } from "../services/cover-utils.js";
import { initCarousel } from "../carousel.js";
import { obterContinuarLista, ehFavorito, alternarFavorito } from "../storage.js";
import { normalizarNumeroProgresso } from "../services/chapter-label.js";
import { mountLoading } from "../ui/states.js";
import { startPerformanceMonitor } from "../core/performance-monitor.js";
import { renderProviderBanner, markCatalogLoaded } from "../services/health-service.js";
import {
    parseRoute,
    showView,
    validateMangaId,
    clearZone,
    ZONES,
    linkManhwa
} from "../core/router.js";
import { MANGA_CATEGORIES } from "../services/manga-schema.js";
import { normalizeManga, isCompleteManga, toLegacyManga } from "../services/data-normalizer.js";
import { capsRecentes, rankingSemanal, rankingMensal } from "../mangas-destaque.js";
import { MangaDetails } from "../ui/manga-details.js";
import { enriquecerMangaComRemoto } from "../services/manga-chapters-link.js";
import { setMangaMeta, resetHomeMeta } from "../seo-meta.js";
import { obterAtualizacoes, formatarTempoRelativo } from "../services/updates-feed.js";

function continuarHref(h) {
    const capNum = normalizarNumeroProgresso(h.capitulo_atual, h.chapterId);
    if (h.chapterId) {
        let url = linkLeitor(h.mangaId, capNum, h.chapterId);
        if (h.paginaAtual > 1) url += `${url.includes("?") ? "&" : "?"}p=${h.paginaAtual}`;
        return url;
    }
    return linkManhwa(h.mangaId);
}

function irMangaAleatorio(catalogo) {
    const lista = catalogo.filter((m) => m?.id && m?.titulo);
    if (!lista.length) return;
    const pick = lista[Math.floor(Math.random() * lista.length)];
    location.href = linkManhwa(pick.id);
}

let detailsView = null;

function isDisplayable(m) {
    if (!m?.id || !m?.titulo) return false;
    try {
        return isCompleteManga(normalizeManga(m, m.id));
    } catch {
        return Boolean((m.capitulos || []).length || m.capa || m.banner);
    }
}

export async function initHomePage() {
    startPerformanceMonitor();

    const route = parseRoute();

    if (route.view === "reader" && route.mangaId && route.chapterNum) {
        const q = new URLSearchParams({
            m: route.mangaId,
            id: route.mangaId,
            n: String(route.chapterNum)
        });
        if (route.chapterId) q.set("ch", route.chapterId);
        location.replace(`/leitor.html?${q}`);
        return;
    }

    if (route.view === "details") {
        showView("details");
        if (!route.mangaId) {
            showDetailsError("ID do mangá ausente na URL.", () => { location.href = "biblioteca.html"; });
            return;
        }
        const check = validateMangaId(route.mangaId);
        if (!check.ok) {
            showDetailsError(check.error, () => { location.href = "biblioteca.html"; });
            return;
        }
        await initDetailsView(check.mangaId);
        return;
    }

    showView("home");
    resetHomeMeta();

    const sections = ["sec-recentes", "sec-ranking", "sec-novidades", "sec-populares", "category-grids"];
    sections.forEach((id) => {
        const el = document.getElementById(id);
        if (el) mountLoading(el, "A carregar...");
    });

    let catalogo = [];
    try {
        catalogo = await obterCatalogoCompleto().catch((e) => {
            console.warn("HomePage catálogo:", e.message);
            return [];
        });
        if (catalogo.length) markCatalogLoaded(true);
        renderProviderBanner("aviso-servidor", { catalogCount: catalogo.length });
    } catch (error) {
        console.error("HomePage init:", error);
    }

    let lista = [];
    try {
        if (!catalogo?.length) {
            throw new Error("Catálogo vazio — verifique a ligação ao servidor.");
        }
        lista = catalogo.filter((m) => m?.id && m?.titulo);

        const pinIds = ["obra-0f20295f"];
        const pinned = pinIds.map((id) => lista.find((m) => m.id === id)).filter(Boolean);
        const destaquesHero = [
            ...pinned,
            ...ordenar(lista, "popular").filter((m) => !pinIds.includes(m.id))
        ].slice(0, 5).map(safeLegacy);
        initCarousel("hero-carousel", destaquesHero);
        renderHomeStats(lista);
        renderQuickNav();

        renderContinuar();
        await renderAtualizacoesHoje();
        await renderRecentes(lista);
        await renderRanking(lista);
        renderRankingMensal(lista);
        renderNovidades(lista);
        renderRecomendados(lista);
        await renderPopulares(lista);
        renderCategoryGrids(lista);
    } catch (error) {
        console.error("HomePage:", error);
        sections.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = `<p class="msg-vazia">Erro ao carregar: ${escHtml(error.message)}</p>`;
        });
    }

    try {
        await renderGeneros(lista);
    } catch (error) {
        console.warn("HomePage gêneros:", error.message);
        const el = document.getElementById("sec-generos");
        if (el) el.innerHTML = '<p class="msg-vazia">Gêneros indisponíveis.</p>';
    }
}

function ensureDetailsView() {
    showView("details");
    const root = document.getElementById("details-root");
    if (!root) return null;
    if (!detailsView) detailsView = new MangaDetails(root);
    return detailsView;
}

function showDetailsError(message, onRetry) {
    showView("details");
    const view = ensureDetailsView();
    if (!view) return;
    document.title = "Erro — AkiraScan";
    view.stopSyncPoll();
    view.showError(message, onRetry);
}

async function initDetailsView(mangaId) {
    const view = ensureDetailsView();
    if (!view) return;

    view.stopSyncPoll();
    view.showLoading();
    document.title = "A carregar… — AkiraScan";

    try {
        const raw = await obterManga(mangaId);
        if (!raw) throw new Error("Mangá não encontrado.");

        const normalized = normalizeManga(raw, mangaId);
        let manga = toLegacyManga(normalized);
        try {
            manga = await enriquecerMangaComRemoto(manga);
        } catch (e) {
            console.warn("HomePage enrich:", e.message);
        }

        document.title = `${manga.titulo} — AkiraScan`;
        setMangaMeta(manga);
        view.render(manga, {
            favorito: ehFavorito(manga.id),
            onFavorito: () => alternarFavorito(manga.id)
        });
        view.startSyncPoll(manga.id, async () => {
            const fresh = await obterManga(mangaId);
            const legacy = toLegacyManga(normalizeManga(fresh, mangaId));
            return await enriquecerMangaComRemoto(legacy);
        });
    } catch (err) {
        view.showError(err.message || "Erro ao carregar.", () => initDetailsView(mangaId));
    }
}

function renderQuickNav() {
    const host = document.getElementById("home-quick-nav");
    if (!host) return;
    const links = [
        { href: "biblioteca.html?sort=popular", label: "🔥 Populares", accent: true },
        { href: "biblioteca.html?sort=recentes", label: "✨ Recentes" },
        { href: "atualizacoes.html", label: "📡 Atualizações" },
        { href: "biblioteca.html?q=favoritos", label: "💖 Favoritos" },
        { href: "ranking.html", label: "🏆 Ranking" },
        { href: "biblioteca.html?genero=acao", label: "⚔ Ação" },
        { href: "biblioteca.html?genero=romance", label: "💕 Romance" },
        { href: "biblioteca.html?genero=fantasia", label: "🐉 Fantasia" }
    ];
    host.innerHTML = links.map((l) =>
        `<a href="${l.href}" class="quick-nav-chip${l.accent ? " quick-nav-chip-accent" : ""}">${escHtml(l.label)}</a>`
    ).join("");
}

function renderHomeStats(catalogo) {
    const el = document.getElementById("home-stats-strip");
    if (!el || !catalogo.length) return;

    const caps = catalogo.reduce((s, m) => s + Number(m.totalCapitulos || m.capitulos?.length || 0), 0);
    const gens = new Set();
    catalogo.forEach((m) => (m.generos || []).forEach((g) => gens.add(g)));
    const rated = catalogo.filter((m) => m.nexusRating).length;

    el.innerHTML = `
        <div class="home-stat-card animate-in">
            <span class="home-stat-val stat-count-up" data-target="${catalogo.length}">0</span>
            <span class="home-stat-lbl">Títulos no catálogo</span>
        </div>
        <div class="home-stat-card animate-in">
            <span class="home-stat-val stat-count-up" data-target="${caps}">0</span>
            <span class="home-stat-lbl">Capítulos listados</span>
        </div>
        <div class="home-stat-card animate-in">
            <span class="home-stat-val stat-count-up" data-target="${gens.size}">0</span>
            <span class="home-stat-lbl">Gêneros</span>
        </div>
        <div class="home-stat-card home-stat-card-accent animate-in">
            <span class="home-stat-val stat-count-up" data-target="${rated}">0</span>
            <span class="home-stat-lbl">Com avaliação Nexus</span>
        </div>`;

    animateStatCounters(el);
}

function animateStatCounters(root) {
    root.querySelectorAll(".stat-count-up").forEach((el) => {
        const target = Number(el.dataset.target) || 0;
        const dur = 900;
        const start = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - start) / dur);
            el.textContent = Math.round(target * p).toLocaleString("pt-BR");
            if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

function matchCategoria(m, cat) {
    const gens = (m.generos || m.genre || []).map((g) => String(g).toLowerCase());
    return cat.genres.some((g) => gens.some((lg) => lg.includes(g.toLowerCase())));
}

function safeLegacy(m) {
    try {
        return toLegacyManga(normalizeManga(m, m.id));
    } catch {
        return m;
    }
}

function renderCategoryGrids(catalogo) {
    const host = document.getElementById("category-grids");
    if (!host) return;

    const html = MANGA_CATEGORIES.map((cat) => {
        const items = catalogo.filter((m) => m?.id && m?.titulo && matchCategoria(m, cat))
            .slice(0, cat.gridLimit);

        if (!items.length) return "";

        return `
        <section class="secao-akira category-grid-section" data-category="${escHtml(cat.id)}">
            <div class="secao-header">
                <h2>${cat.icon} ${escHtml(cat.label)}</h2>
                <a href="biblioteca.html?genero=${encodeURIComponent(cat.genres[0])}">Ver todos (${catalogo.filter((m) => matchCategoria(m, cat)).length})</a>
            </div>
            <div class="grid-mangas" data-category-grid="${escHtml(cat.id)}">
                ${items.map((m) => renderMangaCard(safeLegacy(m), { overlay: true })).join("")}
            </div>
        </section>`;
    }).join("");

    host.innerHTML = html || '<p class="msg-vazia">Nenhuma categoria disponível.</p>';
}

function renderContinuar() {
    const el = document.getElementById("sec-continuar");
    const section = document.getElementById("continuar");
    let show = true;
    try {
        const prefs = JSON.parse(localStorage.getItem("akirascan_prefs_v1") || "{}");
        if (prefs.showContinuarHome === false) show = false;
    } catch { /* ignore */ }
    const continuar = obterContinuarLista();
    if (!show || !continuar.length) {
        section?.classList.add("escondido");
        return;
    }
    section?.classList.remove("escondido");

    el.innerHTML = continuar.map((h) => {
        const capNum = normalizarNumeroProgresso(h.capitulo_atual, h.chapterId);
        const img = coverImgTagAttrs(
            { id: h.mangaId, titulo: h.titulo, capa: h.capa },
            { loading: "lazy" }
        );
        return `
        <a href="${continuarHref(h)}" class="card-continuar"
           data-manga-id="${escHtml(h.mangaId)}" data-resume-cap="${escHtml(String(capNum))}">
            <img ${img.html}>
            <div class="card-continuar-body">
                <h3>${escHtml(h.titulo)}</h3>
                <span class="card-continuar-cap">Cap. ${capNum}</span>
            </div>
        </a>`;
    }).join("");
}

async function renderAtualizacoesHoje() {
    const el = document.getElementById("sec-atualizacoes-hoje");
    const sec = document.getElementById("sec-hoje");
    if (!el) return;
    try {
        const itens = await obterAtualizacoes({ limite: 12, dias: 1 });
        if (!itens.length) {
            sec?.classList.add("escondido");
            return;
        }
        sec?.classList.remove("escondido");
        el.innerHTML = itens.map((item) => {
            const when = formatarTempoRelativo(item.hostedAt);
            const href = linkLeitor(item.mangaId, item.numero, item.capId);
            return `
            <a href="${href}" class="update-item update-item-compact">
                <div class="update-body">
                    <strong class="update-manga">${escHtml(item.tituloManga || item.mangaId)}</strong>
                    <span class="update-cap">Cap. ${escHtml(String(item.numero))}</span>
                    <span class="update-time">${escHtml(when)}</span>
                </div>
                <span class="update-badge-new">NOVO</span>
            </a>`;
        }).join("");
    } catch {
        sec?.classList.add("escondido");
    }
}

async function renderRecentes(catalogoPre = null) {
    const recentes = catalogoPre ? capsRecentes(catalogoPre, 10) : await obterCapsRecentes(10);
    document.getElementById("sec-recentes").innerHTML = recentes.length
        ? recentes.map((r) => {
            const img = coverImgTagAttrs(
                { id: r.mangaId, titulo: r.titulo, capa: r.capa },
                { loading: "lazy" }
            );
            const capNum = numeroCapituloLabel(r.capitulo);
            const pronto = r.capitulo?.legivel === true;
            const href = pronto
                ? linkLeitor(r.mangaId, capNum, r.capitulo.id)
                : linkManhwa(r.mangaId);
            return `
            <a href="${href}"
               class="item-cap-recente" data-manga-id="${escHtml(r.mangaId)}">
                <img ${img.html}>
                <div class="item-cap-recente-info">
                    <strong>${escHtml(r.titulo)}</strong>
                    <span>Capítulo ${capNum}${pronto ? "" : " · a sincronizar"}</span>
                </div>
            </a>`;
        }).join("")
        : '<p class="msg-vazia">Nenhum capítulo recente.</p>';
}

async function renderRanking(catalogoPre = null) {
    const ranking = catalogoPre ? rankingSemanal(catalogoPre, 8) : await obterRankingSemanal(8);
    document.getElementById("sec-ranking").innerHTML = ranking.length
        ? ranking.map((m) => renderRankingItem(m)).join("")
        : '<p class="msg-vazia">Ranking indisponível.</p>';
}

function renderRankingMensal(catalogo) {
    const el = document.getElementById("sec-ranking-mensal");
    if (!el) return;
    const ranking = rankingMensal(catalogo, 8).map((m) => ({ ...safeLegacy(m), rank: m.rank }));
    el.innerHTML = ranking.length
        ? ranking.map((m) => renderRankingItem(m)).join("")
        : '<p class="msg-vazia">Ranking indisponível.</p>';
}

function renderRecomendados(catalogo) {
    const el = document.getElementById("sec-recomendados");
    if (!el) return;
    const rec = ordenar(catalogo.filter((m) => m.nexusRating), "rating").slice(0, 8);
    el.innerHTML = rec.length
        ? `<div class="scroll-row scroll-row-manga">${rec.map((m) => renderMangaCard(safeLegacy(m), { badge: "★ Top", overlay: true })).join("")}</div>`
        : '<p class="msg-vazia">Sem recomendações por nota.</p>';
}

function renderNovidades(catalogo) {
    const novidades = ordenar(catalogo, "recentes").slice(0, 12);
    document.getElementById("sec-novidades").innerHTML = novidades.length
        ? `<div class="scroll-row scroll-row-manga">${novidades.map((m) => renderMangaCard(safeLegacy(m), { badge: "Novo", overlay: true })).join("")}</div>`
        : '<p class="msg-vazia">Sem novidades.</p>';
}

async function renderPopulares(catalogoPreFiltrado = null) {
    const populares = catalogoPreFiltrado
        ? ordenar(catalogoPreFiltrado, "popular").slice(0, 20)
        : (await obterPopulares(20)).slice(0, 20);

    document.getElementById("sec-populares").innerHTML = populares.length
        ? `<div class="scroll-row scroll-row-manga">${populares.map((m) => renderMangaCard(safeLegacy(m), { badge: "Popular", overlay: true })).join("")}</div>`
        : '<p class="msg-vazia">Nenhum título popular completo no momento.</p>';
}

async function renderGeneros(catalogo = []) {
    const { generos } = await listarMangas({ pagina: 1, porPagina: 1 });
    document.getElementById("sec-generos").innerHTML = `
        <button type="button" class="genre-chip genre-chip-random" id="btn-random-manga">🎲 Aleatório</button>
        ${generos.slice(0, 16).map((g) =>
        `<a href="biblioteca.html?genero=${encodeURIComponent(g)}" class="genre-chip">${escHtml(g)}</a>`
    ).join("")}`;
    document.getElementById("btn-random-manga")?.addEventListener("click", () => irMangaAleatorio(catalogo));
}

/** Cards usam linkManhwa → index?view=details&id= */
export { linkManhwa };
