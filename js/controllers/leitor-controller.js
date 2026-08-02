/**
 * Controller — leitor.html (orientado a eventos, limpeza severa de DOM).
 * Modos:
 *   ?m=obra-xxx&n=1[&ch=cap-yyy]  — catálogo / cloud
 *   ?post=BLOGGER_POST_ID[&blog=xxx.blogspot.com] — páginas no Blogger
 */
import { store, Events } from "../core/state-manager.js";
import { parseLeitorRoute, linkLeitor, linkManhwa } from "../core/router.js";
import { obterManga, numeroCapituloLabel } from "../services/data-service.js";
import { MangaRepository } from "../services/manga-repository.js";
import { clearState, limparContainer } from "../core/clear-state.js";
import { onPageRestore } from "../core/app-state.js";
import { LeitorVertical } from "../leitor-vertical.js";
import { salvarProgresso, obterHistorico } from "../storage.js";
import { mountLeitorLoading, mountLeitorError } from "../ui/states.js";
import { escHtml } from "../app-shell.js";
import { fetchBloggerChapter, parseBloggerPostRef } from "../services/blogger-service.js";
import { initReaderToolbar } from "../reader-toolbar.js";

export class LeitorController {
    constructor({ area, tituloCap, contador, barra, navCaps, btnVoltar }) {
        this.area = area;
        this.tituloCap = tituloCap;
        this.contador = contador;
        this.barra = barra;
        this.navCaps = navCaps;
        this.leitorInstance = null;
        this._toolbar = null;
        this._params = new URLSearchParams(location.search);
        this._bloggerPost = parseBloggerPostRef(this._params.get("post"));
        this._bloggerBlog = (this._params.get("blog") || this._params.get("host") || "").trim();
        this._route = this._bloggerPost
            ? { ok: true, mode: "blogger", postId: this._bloggerPost }
            : parseLeitorRoute(this._params);
        this._manga = null;
        this._unsubs = [];

        btnVoltar?.addEventListener("click", () => {
            if (this._route.mode === "blogger") {
                location.href = "biblioteca.html";
                return;
            }
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
        if (this._route.mode === "blogger") {
            return this._loadBlogger();
        }
        return this._loadCatalog();
    }

    async _loadBlogger() {
        clearState(this.area);
        this._destroyLeitor();
        mountLeitorLoading(this.area);
        this.navCaps?.classList.add("escondido");

        try {
            const chapter = await fetchBloggerChapter(this._route.postId, {
                blog: this._bloggerBlog || undefined
            });

            const customTitle = this._params.get("t") || this._params.get("title");
            this.tituloCap.textContent = customTitle || chapter.title;
            document.title = `${customTitle || chapter.title} — AkiraScan`;

            limparContainer(this.area);
            this._setAreaLoading(false);

            this.leitorInstance = new LeitorVertical(this.area, {
                paginas: chapter.pages,
                barraProgresso: this.barra,
                aoMudarPagina: (index, total) => {
                    this.contador.textContent = `${index + 1}/${total}`;
                }
            });
            this.leitorInstance.render();
            this.contador.textContent = `1/${chapter.pages.length}`;
        } catch (error) {
            console.error("[LeitorController/blogger]", error);
            const msg = error.message?.includes("Erro ao carregar")
                ? error.message
                : "Erro ao carregar o capítulo. Tente novamente mais tarde.";
            mountLeitorError(this.area, msg, () => this.load());
        }
    }

    async _loadCatalog() {
        clearState(this.area);
        this._destroyLeitor();
        mountLeitorLoading(this.area);

        const { mangaId, cap, chapterId } = this._route;

        try {
            const manga = await obterManga(mangaId);
            if (!manga?.capitulos?.length) {
                throw new Error("Mangá sem capítulos no catálogo.");
            }

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

            const resumeFromUrl = Number(this._params.get("p") || this._params.get("page") || 0);
            const hist = obterHistorico()[mangaId];
            const resumePage = resumeFromUrl > 0
                ? resumeFromUrl
                : (hist?.chapterId === capId && hist?.paginaAtual > 1 ? hist.paginaAtual : 0);
            if (resumePage > 1) {
                requestAnimationFrame(() => {
                    this.leitorInstance?.scrollToPage(resumePage - 1);
                    this.contador.textContent = `${resumePage}/${paginas.length}`;
                });
            }

            this._setupNavCaps(mangaId, capId, capsOrdenados);
            this._setupToolbar(mangaId, capId, capsOrdenados);

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

    _setupToolbar(mangaId, capId, capsOrdenados) {
        this._toolbar?.destroy?.();
        const legiveis = capsOrdenados.filter((c) => c.legivel === true);
        const lista = legiveis.length ? legiveis : capsOrdenados.filter((c) => c.legivel !== false);
        const idx = lista.findIndex((c) => c.id === capId);

        this._toolbar = initReaderToolbar({
            leitor: this.leitorInstance,
            area: this.area,
            barra: this.barra,
            navCaps: this.navCaps,
            onPrevCap: () => {
                if (idx > 0) {
                    const c = lista[idx - 1];
                    location.href = linkLeitor(mangaId, numeroCapituloLabel(c), c.id);
                }
            },
            onNextCap: () => {
                if (idx >= 0 && idx < lista.length - 1) {
                    const c = lista[idx + 1];
                    location.href = linkLeitor(mangaId, numeroCapituloLabel(c), c.id);
                }
            }
        });
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
        this._toolbar?.destroy?.();
        this._toolbar = null;
        if (this.leitorInstance) {
            this.leitorInstance.destruir?.();
            this.leitorInstance = null;
        }
    }

    destroy() {
        this._destroyLeitor();
        this._unsubs.forEach((u) => u?.());
        this._unsubs = [];
    }
}

export function initLeitorPage(opts) {
    return new LeitorController(opts);
}
