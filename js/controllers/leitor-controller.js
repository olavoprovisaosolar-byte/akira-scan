/**
 * Controller — leitor.html (orientado a eventos, limpeza severa de DOM).
 */
import { store, Events } from "../core/state-manager.js";
import { parseLeitorRoute, linkLeitor, linkManhwa } from "../core/router.js";
import { obterManga, numeroCapituloLabel } from "../services/data-service.js";
import { MangaRepository } from "../services/manga-repository.js";
import { clearState, limparContainer } from "../core/clear-state.js";
import { onPageRestore } from "../core/app-state.js";
import { LeitorVertical } from "../leitor-vertical.js";
import { salvarProgresso } from "../storage.js";
import { mountLeitorLoading, mountLeitorError } from "../ui/states.js";
import { escHtml } from "../app-shell.js";

export class LeitorController {
    constructor({ area, tituloCap, contador, barra, navCaps, btnVoltar }) {
        this.area = area;
        this.tituloCap = tituloCap;
        this.contador = contador;
        this.barra = barra;
        this.navCaps = navCaps;
        this.leitorInstance = null;
        this._route = parseLeitorRoute(new URLSearchParams(location.search));
        this._manga = null;
        this._unsubs = [];

        btnVoltar?.addEventListener("click", () => {
            location.href = this._route.ok ? linkManhwa(this._route.mangaId) : "biblioteca.html";
        });

        this._bindStore();
        this.init();
    }

    _bindStore() {
        this._unsubs.push(
            store.subscribe(Events.LEITOR_LOADING, () => {
                this._setAreaLoading(true);
            }),
            store.subscribe(Events.LEITOR_ERROR, ({ error }) => {
                this._setAreaLoading(false);
                this._renderError(error);
            })
        );
    }

    init() {
        if (!this._route.ok) {
            mountLeitorError(this.area, this._route.error, () => { location.href = "biblioteca.html"; });
            return;
        }

        onPageRestore(() => this.load());
        this.load();
    }

    async load() {
        clearState(this.area);
        this._destroyLeitor();
        mountLeitorLoading(this.area);

        const { mangaId, cap, chapterId } = this._route;

        try {
            const manga = await obterManga(mangaId);
            if (!manga?.capitulos?.length) {
                throw new Error("Mangá sem capítulos no catálogo.");
            }

            // Garante flags legivel para navegação entre caps prontos
            let mangaEnriquecido = manga;
            try {
                const { enriquecerMangaComRemoto } = await import("../services/manga-chapters-link.js");
                mangaEnriquecido = await enriquecerMangaComRemoto(manga);
            } catch { /* usa manga original */ }

            this._manga = mangaEnriquecido;
            const capsOrdenados = [...mangaEnriquecido.capitulos].sort(
                (a, b) => numeroCapituloLabel(a) - numeroCapituloLabel(b)
            );

            const capId = chapterId
                || capsOrdenados.find((c) => String(numeroCapituloLabel(c)) === String(cap))?.id;

            if (!capId) throw new Error("Capítulo não encontrado.");

            const capAtual = capsOrdenados.find((c) => c.id === capId) || { id: capId, numero: cap };
            const capLabel = numeroCapituloLabel(capAtual);

            this.tituloCap.textContent = `${manga.titulo} · Cap. ${capLabel}`;
            document.title = `Cap. ${capLabel} — ${manga.titulo} — AkiraScan`;

            const paginas = await MangaRepository.getChapterPages(mangaId, capLabel, capId, {
                manga: this._manga
            });
            if (!paginas?.length) {
                throw new Error("Capítulo sem páginas disponíveis.");
            }

            limparContainer(this.area);
            this._setAreaLoading(false);

            this.leitorInstance = new LeitorVertical(this.area, {
                paginas,
                barraProgresso: this.barra,
                aoMudarPagina: (index, total) => {
                    this.contador.textContent = `${index + 1}/${total}`;
                    salvarProgresso(mangaId, {
                        titulo: manga.titulo,
                        capa: manga.capa,
                        capitulo_atual: capLabel,
                        chapterId: capId,
                        paginaAtual: index + 1,
                        totalPaginas: total,
                        progresso: Math.round(((index + 1) / total) * 100)
                    });
                }
            });
            this.leitorInstance.render();
            this.contador.textContent = `1/${paginas.length}`;

            this._setupNavCaps(mangaId, capId, capsOrdenados);

            salvarProgresso(mangaId, {
                titulo: manga.titulo,
                capa: manga.capa,
                capitulo_atual: capLabel,
                chapterId: capId,
                paginaAtual: 1,
                totalPaginas: paginas.length,
                progresso: 5
            });
        } catch (error) {
            console.error("[LeitorController]", error);
            mountLeitorError(this.area, error.message || "Não foi possível carregar este capítulo.", () => this.load());
        }
    }

    _setupNavCaps(mangaId, capId, capsOrdenados) {
        this.navCaps?.classList.remove("escondido");
        const legiveis = capsOrdenados.filter((c) => c.legivel === true);
        const lista = legiveis.length ? legiveis : capsOrdenados.filter((c) => c.legivel !== false);
        const idx = lista.findIndex((c) => c.id === capId);
        const btnAnt = document.getElementById("btn-cap-anterior");
        const btnProx = document.getElementById("btn-cap-proximo");

        if (btnAnt) {
            btnAnt.disabled = idx <= 0;
            btnAnt.onclick = () => {
                if (idx > 0) {
                    const c = lista[idx - 1];
                    location.href = linkLeitor(mangaId, numeroCapituloLabel(c), c.id);
                }
            };
        }
        if (btnProx) {
            btnProx.disabled = idx < 0 || idx >= lista.length - 1;
            btnProx.onclick = () => {
                if (idx >= 0 && idx < lista.length - 1) {
                    const c = lista[idx + 1];
                    location.href = linkLeitor(mangaId, numeroCapituloLabel(c), c.id);
                }
            };
        }
    }

    _setAreaLoading(isLoading) {
        this.area.style.opacity = isLoading ? "0.5" : "1";
    }

    _renderError(msg) {
        limparContainer(this.area);
        this.area.innerHTML = `
        <div class="leitor-estado">
            <h2>Erro</h2>
            <p>${escHtml(msg)}</p>
            <button class="btn-retry" type="button" id="leitor-retry">Tentar de novo</button>
        </div>`;
        this.area.querySelector("#leitor-retry")?.addEventListener("click", () => this.load());
    }

    _destroyLeitor() {
        this.leitorInstance = null;
    }

    destroy() {
        this._unsubs.forEach((fn) => fn());
        this._destroyLeitor();
        limparContainer(this.area);
    }
}

export function initLeitorPage(opts) {
    return new LeitorController(opts);
}
