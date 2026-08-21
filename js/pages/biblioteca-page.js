/**
 * Controller — página biblioteca.html (filtros avançados + instant search).
 */
import { appState, limparContainer } from "../core/app-state.js";
import { listarMangas } from "../services/data-service.js";
import { renderMangaCard, renderSidebarGeneros, escHtml } from "../app-shell.js";
import { mountSkeletonGrid } from "../ui/skeleton.js";
import { obterFavoritos } from "../storage.js";
import { slugGenero } from "../services/genre-utils.js";

export function createBibliotecaController({ grid, sidebar, totalLabel, btnMais, statusEl, params, toolbar, filtersPanel }) {
    let pagina = 1;
    let temMais = true;
    let carregando = false;
    let searchTimer = null;

    function syncUrl() {
        const q = params.toString();
        const next = `biblioteca.html${q ? `?${q}` : ""}`;
        if (`${location.pathname.split("/").pop()}${location.search}` !== next) {
            history.replaceState({}, "", next);
        }
    }

    function getFilters() {
        return {
            status: params.get("status") || document.getElementById("filt-status")?.value || "",
            minRating: params.get("rating") || document.getElementById("filt-rating")?.value || "",
            ano: params.get("ano") || document.getElementById("filt-ano")?.value || "",
            minCaps: params.get("minCaps") || document.getElementById("filt-caps")?.value || "",
            tipo: params.get("tipo") || document.getElementById("filt-tipo")?.value || ""
        };
    }

    function renderFiltersPanel() {
        if (!filtersPanel) return;
        const f = getFilters();
        filtersPanel.innerHTML = `
        <div class="bib-filters-row">
            <div class="bib-filter-group bib-search-instant">
                <label for="bib-search-live">Pesquisa instantânea</label>
                <input type="search" id="bib-search-live" placeholder="Nome, autor, gênero…" value="${escHtml(params.get("q") === "favoritos" ? "" : (params.get("q") || ""))}">
            </div>
            <div class="bib-filter-group">
                <label for="filt-status">Status</label>
                <select id="filt-status">
                    <option value="">Todos</option>
                    <option value="em lan" ${f.status.includes("em lan") ? "selected" : ""}>Em lançamento</option>
                    <option value="complet" ${f.status.includes("complet") ? "selected" : ""}>Completo</option>
                    <option value="hiatus" ${f.status.includes("hiatus") ? "selected" : ""}>Hiato</option>
                </select>
            </div>
            <div class="bib-filter-group">
                <label for="filt-rating">Nota mín.</label>
                <select id="filt-rating">
                    <option value="">Qualquer</option>
                    <option value="7" ${f.minRating === "7" ? "selected" : ""}>★ 7+</option>
                    <option value="8" ${f.minRating === "8" ? "selected" : ""}>★ 8+</option>
                    <option value="9" ${f.minRating === "9" ? "selected" : ""}>★ 9+</option>
                </select>
            </div>
            <div class="bib-filter-group">
                <label for="filt-tipo">Tipo</label>
                <select id="filt-tipo">
                    <option value="">Todos</option>
                    <option value="manga" ${f.tipo === "manga" ? "selected" : ""}>Mangá</option>
                    <option value="manhwa" ${f.tipo === "manhwa" ? "selected" : ""}>Manhwa</option>
                    <option value="manhua" ${f.tipo === "manhua" ? "selected" : ""}>Manhua</option>
                    <option value="webtoon" ${f.tipo === "webtoon" ? "selected" : ""}>Webtoon</option>
                </select>
            </div>
            <div class="bib-filter-group">
                <label for="filt-ano">Ano</label>
                <select id="filt-ano">
                    <option value="">Qualquer</option>
                    ${(() => {
                        const yNow = new Date().getFullYear();
                        const years = [];
                        for (let y = yNow; y >= 2010; y--) years.push(String(y));
                        if (f.ano && !years.includes(f.ano)) years.unshift(f.ano);
                        return years.map((y) => `<option value="${y}" ${f.ano === y ? "selected" : ""}>${y}</option>`).join("");
                    })()}
                </select>
            </div>
            <div class="bib-filter-group">
                <label for="filt-caps">Mín. caps</label>
                <select id="filt-caps">
                    <option value="">Qualquer</option>
                    <option value="10" ${f.minCaps === "10" ? "selected" : ""}>10+</option>
                    <option value="50" ${f.minCaps === "50" ? "selected" : ""}>50+</option>
                    <option value="100" ${f.minCaps === "100" ? "selected" : ""}>100+</option>
                </select>
            </div>
            <div class="bib-filter-group">
                <label for="filt-sort">Ordenar</label>
                <select id="filt-sort">
                    <option value="az" ${(params.get("sort") || "az") === "az" ? "selected" : ""}>A–Z</option>
                    <option value="popular" ${params.get("sort") === "popular" ? "selected" : ""}>Populares</option>
                    <option value="recentes" ${params.get("sort") === "recentes" ? "selected" : ""}>Recentes</option>
                    <option value="rating" ${params.get("sort") === "rating" ? "selected" : ""}>Melhor nota</option>
                    <option value="caps" ${params.get("sort") === "caps" ? "selected" : ""}>Mais caps</option>
                </select>
            </div>
        </div>`;

        const live = document.getElementById("bib-search-live");
        live?.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                const q = live.value.trim();
                if (q) params.set("q", q);
                else params.delete("q");
                syncUrl();
                carregar(true);
            }, 280);
        });

        filtersPanel.querySelectorAll("select").forEach((sel) => {
            sel.addEventListener("change", () => {
                const map = {
                    "filt-status": "status",
                    "filt-rating": "rating",
                    "filt-caps": "minCaps",
                    "filt-sort": "sort",
                    "filt-tipo": "tipo",
                    "filt-ano": "ano"
                };
                const key = map[sel.id];
                if (!key) return;
                if (sel.value) params.set(key, sel.value);
                else params.delete(key);
                syncUrl();
                carregar(true);
            });
        });
    }

    function renderToolbar(genero, sort, busca) {
        if (!toolbar) return;
        const chips = [
            { href: buildUrl({ sort: "popular" }), label: "🔥 Populares", on: sort === "popular" && !genero && !busca },
            { href: buildUrl({ sort: "recentes" }), label: "✨ Recentes", on: sort === "recentes" && !genero && !busca },
            { href: buildUrl({ sort: "rating" }), label: "★ Nota", on: sort === "rating" && !genero && !busca },
            { href: buildUrl({ sort: "caps" }), label: "📚 Caps", on: sort === "caps" && !genero && !busca },
            { href: "biblioteca.html?q=favoritos", label: "♥ Favoritos", on: busca === "favoritos" }
        ];
        toolbar.innerHTML = chips.map((c) =>
            `<a href="${c.href}" class="bib-chip${c.on ? " ativo" : ""}">${escHtml(c.label)}</a>`
        ).join("");
    }

    function buildUrl(overrides = {}) {
        const p = new URLSearchParams(params);
        Object.entries(overrides).forEach(([k, v]) => {
            if (v) p.set(k, v);
            else p.delete(k);
        });
        const q = p.toString();
        return `biblioteca.html${q ? `?${q}` : ""}`;
    }

    async function carregar(reset = false) {
        if (carregando || (!temMais && !reset)) return;
        carregando = true;

        if (reset) {
            appState.reset();
            pagina = 1;
            temMais = true;
            limparContainer(grid);
            mountSkeletonGrid(grid, 8);
        }

        const load = appState.beginLoad();
        const busca = params.get("q") || "";
        const genero = params.get("genero") || "";
        const sort = params.get("sort") || document.getElementById("filt-sort")?.value || "az";
        const favoritos = busca === "favoritos" ? obterFavoritos() : null;
        const filters = getFilters();

        try {
            const { mangas, hasNext, total, generos } = await listarMangas({
                pagina,
                porPagina: 24,
                busca,
                genero,
                sort,
                favoritos,
                status: filters.status,
                minRating: filters.minRating,
                ano: filters.ano,
                minCaps: filters.minCaps,
                tipo: filters.tipo
            });

            if (load.isStale()) return;
            if (reset) limparContainer(grid);

            if (!mangas.length && pagina === 1) {
                grid.innerHTML = '<p class="msg-vazia">Nenhum mangá encontrado.</p>';
            } else if (reset || pagina === 1) {
                grid.innerHTML = mangas.map((m) => renderMangaCard(m, { overlay: true, rich: true })).join("");
            } else {
                grid.insertAdjacentHTML("beforeend", mangas.map((m) => renderMangaCard(m, { overlay: true, rich: true })).join(""));
            }

            sidebar.innerHTML = renderSidebarGeneros(generos, genero, sort);
            renderToolbar(genero, sort, busca);
            totalLabel.textContent = `${total.toLocaleString("pt-BR")} títulos`;
            statusEl.textContent = "";
            temMais = hasNext;
            pagina += 1;
            btnMais.classList.toggle("escondido", !temMais);
        } catch (error) {
            if (load.isStale()) return;
            grid.innerHTML = `<p class="msg-vazia">Erro: ${error.message}</p>`;
            statusEl.textContent = "Falha ao carregar catálogo.";
        } finally {
            carregando = false;
        }
    }

    renderFiltersPanel();
    btnMais.addEventListener("click", () => carregar(false));

    sidebar?.addEventListener("click", (e) => {
        const a = e.target.closest("a.genre-chip[href*='genero=']");
        if (!a) return;
        e.preventDefault();
        let g = "";
        try {
            g = new URL(a.getAttribute("href"), location.origin).searchParams.get("genero") || "";
        } catch {
            return;
        }
        if (!g) return;
        const cur = (params.get("genero") || "").split(/[,|]/).map((s) => s.trim()).filter(Boolean);
        const idx = cur.findIndex((x) => slugGenero(x) === slugGenero(g));
        if (idx >= 0) cur.splice(idx, 1);
        else cur.push(g);
        if (cur.length) params.set("genero", cur.join(","));
        else params.delete("genero");
        syncUrl();
        carregar(true);
    });

    return { carregar };
}
