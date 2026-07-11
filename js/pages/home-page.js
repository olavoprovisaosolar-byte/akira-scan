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
import { mountHeroPlanet } from "../ui/hero-planet.js";
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
import { capsRecentes, rankingSemanal } from "../mangas-destaque.js";
import { MangaDetails } from "../ui/manga-details.js";
import { enriquecerMangaComRemoto } from "../services/manga-chapters-link.js";

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

    if (route.view === "details") {
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

        mountHeroPlanet("hero-planet-slot", { catalogo }).catch((e) => {
            console.warn("HomePage hero:", e.message);
        });
    } catch (error) {
        console.error("HomePage init:", error);
        mountHeroPlanet("hero-planet-slot").catch(() => {});
    }

    try {
        if (!catalogo?.length) {
            throw new Error("Catálogo vazio — verifique a ligação ao servidor.");
        }
        const lista = catalogo.filter((m) => m?.id && m?.titulo);

        renderContinuar();
        await renderRecentes(lista);
        await renderRanking(lista);
        renderNovidades(lista);
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
        await renderGeneros();
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
                ${items.map((m) => renderMangaCard(safeLegacy(m))).join("")}
            </div>
        </section>`;
    }).join("");

    host.innerHTML = html || '<p class="msg-vazia">Nenhuma categoria disponível.</p>';
}

function renderContinuar() {
    const el = document.getElementById("sec-continuar");
    const section = document.getElementById("continuar");
    const continuar = obterContinuarLista();
    if (!continuar.length) {
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
        // Continuar → detalhes (evita abrir cap ainda não sincronizado no Pages)
        return `
        <a href="${linkManhwa(h.mangaId)}" class="card-continuar"
           data-manga-id="${escHtml(h.mangaId)}" data-resume-cap="${escHtml(String(capNum))}">
            <img ${img.html}>
            <div class="card-continuar-body">
                <h3>${escHtml(h.titulo)}</h3>
                <span class="card-continuar-cap">Cap. ${capNum}</span>
            </div>
        </a>`;
    }).join("");
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

function renderNovidades(catalogo) {
    const novidades = ordenar(catalogo, "recentes").slice(0, 6);
    document.getElementById("sec-novidades").innerHTML = novidades.length
        ? novidades.map((m) => renderMangaCard(safeLegacy(m), { badge: "Novo" })).join("")
        : '<p class="msg-vazia">Sem novidades.</p>';
}

async function renderPopulares(catalogoPreFiltrado = null) {
    const populares = catalogoPreFiltrado
        ? ordenar(catalogoPreFiltrado, "popular").slice(0, 8)
        : (await obterPopulares(16)).slice(0, 8);

    document.getElementById("sec-populares").innerHTML = populares.length
        ? populares.map((m) => renderMangaCard(safeLegacy(m), { badge: "Popular" })).join("")
        : '<p class="msg-vazia">Nenhum título popular completo no momento.</p>';
}

async function renderGeneros() {
    const { generos } = await listarMangas({ pagina: 1, porPagina: 1 });
    document.getElementById("sec-generos").innerHTML = generos.slice(0, 16).map((g) =>
        `<a href="biblioteca.html?genero=${encodeURIComponent(g)}" class="genre-chip">${escHtml(g)}</a>`
    ).join("");
}

/** Cards usam linkManhwa → index?view=details&id= */
export { linkManhwa };
