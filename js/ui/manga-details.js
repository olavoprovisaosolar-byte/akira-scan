/**
 * Componente Detalhes — banner, sinopse e capítulos (separado da listagem).
 */
import { escHtml } from "../app-shell.js";
import { linkLeitor, linkBiblioteca } from "../core/router.js";
import { parseChapterNumber } from "../services/chapter-label.js";
import { sanitizeMangaForRender, renderUnavailableMessage } from "../services/data-validator.js";
import { applyCoverToImg } from "../services/cover-utils.js";
import {
    renderChapterGrid,
    bindChapterGrid,
    bindChapterToolbar,
    renderChapterToolbar,
    contarCapsLegiveis,
    primeiroCapLegivel
} from "./chapter-grid.js";
import { corDoManga } from "../banner-manga.js";

export class MangaDetails {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;
    }

    clear() {
        this.container.querySelectorAll("img").forEach((img) => {
            img.removeAttribute("src");
            img.src = "";
        });
        this.container.replaceChildren();
    }

    showLoading(msg = "A carregar mangá...") {
        this.clear();
        this.container.innerHTML = `
        <div class="akira-state akira-state-loading" role="status">
            <div class="akira-spinner"></div>
            <p>${escHtml(msg)}</p>
        </div>`;
    }

    showError(message, onRetry) {
        this.clear();
        this.container.innerHTML = `
        <div class="akira-state akira-state-error" role="alert">
            <h2>Erro</h2>
            <p>${escHtml(message)}</p>
            <button type="button" class="btn-akira btn-akira-primary" id="details-retry">Tentar novamente</button>
        </div>`;
        this.container.querySelector("#details-retry")?.addEventListener("click", onRetry);
    }

    /**
     * @param {import('../types/manga.d.ts').Manga} manga
     */
    render(manga, { favorito = false, onFavorito } = {}) {
        let safe;
        try {
            safe = sanitizeMangaForRender(manga, manga.id);
        } catch (e) {
            this.clear();
            this.container.innerHTML = renderUnavailableMessage(e.message);
            return;
        }
        this.clear();

        const accent = `hsl(${corDoManga(safe.id)}, 72%, 52%)`;
        const { total, legiveis } = contarCapsLegiveis(safe);
        const lerCap = primeiroCapLegivel(safe);
        const lerHref = lerCap
            ? linkLeitor(safe.id, parseChapterNumber(lerCap), lerCap.id)
            : "#";
        const syncHint = total > 0 && legiveis < total
            ? `<p class="chapter-sync-hint">A sincronização continua em segundo plano. Filtra por <strong>Prontos</strong> para ver só o que já abre.</p>`
            : legiveis > 0
                ? `<p class="chapter-sync-hint is-ok">Todos os capítulos listados estão prontos para ler.</p>`
                : "";

        const article = document.createElement("article");
        article.className = "manga-details";
        article.dataset.mangaId = safe.id;

        const onInvalid = (msg) => {
            const hint = article.querySelector(".chapter-sync-hint");
            if (hint) {
                hint.textContent = msg;
                hint.classList.add("is-alert");
                hint.classList.remove("is-ok");
            }
        };

        article.innerHTML = `
        <div class="manga-hero manga-details-hero" style="--banner-accent:${accent}">
            <img class="manga-hero-bg" alt="" data-role="banner" data-manga-id="${escHtml(safe.id)}">
            <div class="manga-hero-overlay"></div>
            <div class="manga-hero-content">
                <img class="manga-hero-capa" alt="${escHtml(safe.titulo)}"
                     data-role="capa" data-manga-id="${escHtml(safe.id)}">
                <div class="manga-hero-texto">
                    <p class="hero-kicker">Detalhes</p>
                    <h1>${escHtml(safe.titulo)}</h1>
                    <div class="manga-hero-meta">
                        ${safe.autor ? `<span class="meta-tag">✍ ${escHtml(safe.autor)}</span>` : ""}
                        ${safe.status ? `<span class="meta-tag">${escHtml(safe.status)}</span>` : ""}
                        <span class="meta-tag meta-tag-ready">${legiveis}/${total} legíveis</span>
                    </div>
                    <div class="manga-hero-meta">
                        ${(safe.generos || []).map((g) => `<span class="meta-tag">${escHtml(g)}</span>`).join("")}
                    </div>
                    <div class="manga-hero-actions">
                        <a href="${lerHref}" class="btn-akira btn-akira-primary btn-ler-primeiro${lerCap ? "" : " is-disabled"}"
                           data-manga-id="${escHtml(safe.id)}" ${lerCap ? "" : 'aria-disabled="true"'}>▶ Ler</a>
                        <button type="button" id="btn-fav-details" class="btn-akira btn-akira-ghost">
                            ${favorito ? "♥ Favorito" : "♡ Favoritar"}
                        </button>
                        <a href="${linkBiblioteca()}" class="btn-akira btn-akira-ghost">← Voltar</a>
                    </div>
                </div>
            </div>
        </div>
        <section class="manga-details-sinopse" aria-labelledby="sinopse-titulo">
            <h2 id="sinopse-titulo">Sinopse</h2>
            <p class="sinopse-texto">${escHtml(safe.sinopse || "Sinopse não disponível.")}</p>
        </section>
        <section class="manga-details-capitulos" aria-labelledby="caps-titulo">
            <div class="secao-header">
                <h2 id="caps-titulo">Capítulos <span class="chapter-count">(${legiveis}/${total})</span></h2>
            </div>
            ${renderChapterToolbar(safe)}
            ${syncHint}
            <div class="chapter-grid-host"></div>
        </section>`;

        const gridHost = article.querySelector(".chapter-grid-host");
        if (gridHost) {
            gridHost.innerHTML = renderChapterGrid(safe, { filter: "all" });
            bindChapterGrid(gridHost, safe, { onInvalid });
            bindChapterToolbar(article, safe, { onInvalid });
        }

        this.container.appendChild(article);

        applyCoverToImg(article.querySelector('[data-role="banner"]'), safe, { banner: true });
        applyCoverToImg(article.querySelector('[data-role="capa"]'), safe);

        article.querySelector("#btn-fav-details")?.addEventListener("click", (e) => {
            const agora = onFavorito?.();
            if (typeof agora === "boolean") {
                e.target.textContent = agora ? "💖 Favorito" : "🤍 Favoritar";
            }
        });
    }
}
