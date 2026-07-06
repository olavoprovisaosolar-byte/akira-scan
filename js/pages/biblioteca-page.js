/**
 * Controller — página biblioteca.html.
 */
import { appState, limparContainer } from "../core/app-state.js";
import { listarMangas } from "../services/data-service.js";
import { renderMangaCard, renderSidebarGeneros } from "../app-shell.js";
import { mountLoading } from "../ui/states.js";
import { obterFavoritos } from "../storage.js";

export function createBibliotecaController({ grid, sidebar, totalLabel, btnMais, statusEl, params }) {
    let pagina = 1;
    let temMais = true;
    let carregando = false;

    async function carregar(reset = false) {
        if (carregando || (!temMais && !reset)) return;
        carregando = true;

        if (reset) {
            appState.reset();
            pagina = 1;
            temMais = true;
            limparContainer(grid);
            mountLoading(grid, "A carregar biblioteca...");
        }

        const load = appState.beginLoad();
        const busca = params.get("q") || "";
        const genero = params.get("genero") || "";
        const sort = params.get("sort") || "az";
        const favoritos = busca === "favoritos" ? obterFavoritos() : null;

        try {
            const { mangas, hasNext, total, generos } = await listarMangas({
                pagina,
                porPagina: 24,
                busca,
                genero,
                sort,
                favoritos
            });

            if (load.isStale()) return;

            if (reset) limparContainer(grid);

            if (!mangas.length && pagina === 1) {
                grid.innerHTML = '<p class="msg-vazia">Nenhum mangá encontrado.</p>';
            } else if (reset || pagina === 1) {
                grid.innerHTML = mangas.map((m) => renderMangaCard(m)).join("");
            } else {
                grid.insertAdjacentHTML("beforeend", mangas.map((m) => renderMangaCard(m)).join(""));
            }

            sidebar.innerHTML = renderSidebarGeneros(generos, genero);
            totalLabel.textContent = `${total} títulos`;
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

    btnMais.addEventListener("click", () => carregar(false));

    return { carregar };
}
