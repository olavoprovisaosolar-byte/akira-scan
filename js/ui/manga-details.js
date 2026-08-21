/**
 * Componente Detalhes — banner, sinopse e capítulos (separado da listagem).
 */
import { escHtml, renderMangaCard } from "../app-shell.js";
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
import { renderComentariosSection, bindComentarios } from "../comments.js";
import { obterHistorico, ehFavorito } from "../storage.js";
import { LISTA_OPCOES, obterListaAtual, aplicarLista } from "./reading-list.js";
import { obterRating, guardarRating } from "../services/manga-ratings.js";
import { matchGenero } from "../services/genre-utils.js";
import { obterCatalogoCompleto } from "../services/data-service.js";

export class MangaDetails {
    /**
     * @param {HTMLElement} container
     */
    constructor(container) {
        this.container = container;
        this._syncPoll = null;
        this._lastProntos = -1;
        this._onInvalid = null;
    }

    stopSyncPoll() {
        if (this._syncPoll) {
            clearInterval(this._syncPoll);
            this._syncPoll = null;
        }
    }

    /**
     * Atualiza progresso de sync enquanto o upload corre em background.
     * @param {string} mangaId
     * @param {() => Promise<object>} reloadManga
     */
    startSyncPoll(mangaId, reloadManga) {
        this.stopSyncPoll();
        const article = this.container.querySelector(".manga-details");
        if (!article || article.dataset.mangaId !== mangaId) return;

        const tick = async () => {
            if (document.hidden) return;
            try {
                const manga = await reloadManga();
                const { total, legiveis } = contarCapsLegiveis(manga);
                if (legiveis <= this._lastProntos) return;
                this._lastProntos = legiveis;
                this.patchSync(manga);
                if (total > 0 && legiveis >= total) this.stopSyncPoll();
            } catch { /* ignore */ }
        };

        this._syncPoll = setInterval(tick, 30000);
    }

    patchSync(manga) {
        const article = this.container.querySelector(".manga-details");
        if (!article || article.dataset.mangaId !== manga.id) return;

        const { total, legiveis } = contarCapsLegiveis(manga);
        const pct = total > 0 ? Math.round((legiveis / total) * 100) : 0;
        const lerCap = primeiroCapLegivel(manga);
        const lerHref = lerCap
            ? linkLeitor(manga.id, parseChapterNumber(lerCap), lerCap.id)
            : "#";

        const capsInfo = article.querySelector(".manga-info-caps");
        if (capsInfo) capsInfo.textContent = `${legiveis}/${total} legíveis`;
        const countEl = article.querySelector(".chapter-count");
        if (countEl) countEl.textContent = `(${legiveis}/${total})`;

        const progress = article.querySelector(".chapter-progress");
        if (progress) {
            progress.setAttribute("aria-valuenow", String(pct));
            const bar = progress.querySelector(".chapter-progress-bar");
            const label = progress.querySelector(".chapter-progress-label");
            if (bar) bar.style.width = `${pct}%`;
            if (label) label.textContent = `${legiveis} de ${total} prontos (${pct}%)`;
        }

        const hint = article.querySelector(".chapter-sync-hint");
        if (hint) {
            if (total > 0 && legiveis < total) {
                hint.innerHTML = `A sincronização continua em segundo plano. Filtra por <strong>Prontos</strong> para ver só o que já abre.`;
                hint.classList.remove("is-ok", "is-alert");
            } else if (legiveis > 0) {
                hint.textContent = "Todos os capítulos listados estão prontos para ler.";
                hint.classList.add("is-ok");
                hint.classList.remove("is-alert");
            }
        }

        const btnLer = article.querySelector(".btn-ler-primeiro");
        if (btnLer) {
            btnLer.href = lerHref;
            btnLer.classList.toggle("is-disabled", !lerCap);
            btnLer.toggleAttribute("aria-disabled", !lerCap);
        }

        const gridHost = article.querySelector(".chapter-grid-host");
        const activeFilter = article.querySelector(".chapter-filter.is-active")?.dataset.filter || "all";
        const activeSort = article.querySelector(".chapter-sort-btn.is-active")?.dataset.sort || "desc";
        if (gridHost) {
            gridHost.innerHTML = renderChapterGrid(manga, { filter: activeFilter, sort: activeSort });
            bindChapterGrid(gridHost, manga, { onInvalid: this._onInvalid });
        }
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

        const nexusLink = safe.nexusUrl
            ? `<a href="${escHtml(safe.nexusUrl)}" class="meta-tag meta-tag-link" target="_blank" rel="noopener noreferrer">NexusToons ↗</a>`
            : "";

        const hist = obterHistorico()[safe.id];
        const capResume = hist
            ? (hist.chapterId
                ? linkLeitor(safe.id, hist.capitulo_atual, hist.chapterId)
                : linkLeitor(safe.id, hist.capitulo_atual))
            : "";
        const listaAtual = obterListaAtual(safe.id);
        const tipo = safe.nexusType || safe.tipo || safe.type || "Mangá";
        const alt = safe.alternativeTitle || safe.tituloAlternativo || "";
        const autor = safe.autor || safe.author || "";
        const artista = safe.artista || safe.artist || "";
        const ano = safe.ano || safe.releaseYear || safe.nexusYear || safe.year || "";

        const infoRows = [
            ["Tipo", escHtml(tipo)],
            autor ? ["Autor", escHtml(autor)] : null,
            artista && artista !== autor ? ["Artista", escHtml(artista)] : null,
            ano ? ["Lançamento", escHtml(String(ano))] : null,
            safe.status ? ["Status", escHtml(safe.status)] : null,
            ["Capítulos", `<span class="manga-info-caps">${legiveis}/${total} legíveis</span>`],
            alt ? ["Título alt.", escHtml(alt)] : null
        ].filter(Boolean);

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
        this._onInvalid = onInvalid;
        this._lastProntos = legiveis;

        article.innerHTML = `
        <div class="manga-hero manga-details-hero" style="--banner-accent:${accent}">
            <img class="manga-hero-bg" alt="" data-role="banner" data-manga-id="${escHtml(safe.id)}">
            <div class="manga-hero-overlay"></div>
            <div class="manga-hero-content">
                <img class="manga-hero-capa" alt="${escHtml(safe.titulo)}"
                     data-role="capa" data-manga-id="${escHtml(safe.id)}">
                <div class="manga-hero-texto">
                    <p class="hero-kicker">Obra</p>
                    <h1>${escHtml(safe.titulo)}</h1>
                    <div class="manga-stars" id="manga-stars" data-manga-id="${escHtml(safe.id)}">
                        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="manga-star" data-star="${n}" aria-label="Nota ${n}">★</button>`).join("")}
                        <span class="manga-stars-avg" id="manga-stars-avg">${safe.nexusRating ? `★ ${Number(safe.nexusRating).toFixed(1)}` : "Sem notas"}</span>
                    </div>
                    <div class="manga-hero-actions">
                        ${capResume
                            ? `<a href="${capResume}" class="btn-akira btn-akira-primary">▶ Continuar</a>`
                            : `<a href="${lerHref}" class="btn-akira btn-akira-primary btn-ler-primeiro${lerCap ? "" : " is-disabled"}"
                           data-manga-id="${escHtml(safe.id)}" ${lerCap ? "" : 'aria-disabled="true"'}>▶ Ler</a>`}
                        <label class="manga-list-wrap">
                            <span class="visually-hidden">Lista</span>
                            <select id="manga-list-select" class="manga-list-select" aria-label="Adicionar à lista">
                                ${LISTA_OPCOES.map((o) => `<option value="${o.value}"${listaAtual === o.value ? " selected" : ""}>${escHtml(o.label)}</option>`).join("")}
                            </select>
                        </label>
                        <button type="button" id="btn-fav-details" class="btn-akira btn-akira-ghost btn-fav-pulse">
                            ${favorito ? "💖 Favorito" : "🤍 Favoritar"}
                        </button>
                        <a href="${linkBiblioteca()}" class="btn-akira btn-akira-ghost">← Voltar</a>
                    </div>
                </div>
            </div>
        </div>
        <section class="manga-info-panel" aria-label="Informações">
            <dl class="manga-info-table">
                ${infoRows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}
            </dl>
            <div class="manga-info-genres">
                ${(safe.generos || []).map((g) =>
                    `<a href="${linkBiblioteca({ genero: g })}" class="meta-tag meta-tag-link">${escHtml(g)}</a>`
                ).join("")}
                ${nexusLink}
            </div>
        </section>
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
        </section>
        <section class="manga-related" id="manga-related" aria-labelledby="related-title" hidden>
            <div class="secao-header"><h2 id="related-title">Obras relacionadas</h2></div>
            <div class="scroll-row scroll-row-manga" id="manga-related-grid"></div>
        </section>
        <div class="manga-comments-host"></div>`;

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
                const sel = article.querySelector("#manga-list-select");
                if (!agora && sel?.value === "favorito") {
                    aplicarLista(safe.id, "");
                    sel.value = "";
                }
            }
        });

        article.querySelector("#manga-list-select")?.addEventListener("change", (e) => {
            const next = aplicarLista(safe.id, e.target.value);
            e.target.value = next;
            const favBtn = article.querySelector("#btn-fav-details");
            if (favBtn) favBtn.textContent = ehFavorito(safe.id) ? "💖 Favorito" : "🤍 Favoritar";
        });

        bindMangaStars(article, safe);
        fillRelated(article, safe);

        const commentsHost = article.querySelector(".manga-comments-host");
        if (commentsHost) {
            commentsHost.innerHTML = renderComentariosSection(safe.id, escHtml);
            bindComentarios(commentsHost, safe.id, escHtml);
        }
    }
}

function paintStars(root, mine, avg, count) {
    root.querySelectorAll(".manga-star").forEach((btn) => {
        const n = Number(btn.dataset.star);
        btn.classList.toggle("is-on", n <= mine);
    });
    const label = root.querySelector("#manga-stars-avg");
    if (!label) return;
    if (avg > 0) {
        label.textContent = `★ ${avg.toFixed(1)}${count ? ` (${count})` : ""}`;
    } else if (mine) {
        label.textContent = `A tua nota: ${mine}`;
    } else {
        label.textContent = "Sem notas";
    }
}

function bindMangaStars(article, manga) {
    const host = article.querySelector("#manga-stars");
    if (!host) return;
    obterRating(manga.id).then((r) => {
        paintStars(host, r.mine, r.avg || Number(manga.nexusRating) || 0, r.count);
    }).catch(() => {});

    host.addEventListener("click", async (e) => {
        const btn = e.target.closest(".manga-star");
        if (!btn) return;
        const score = Number(btn.dataset.star);
        paintStars(host, score, score, 1);
        const r = await guardarRating(manga.id, score);
        paintStars(host, r.mine || score, r.avg || score, r.count || 1);
    });
}

async function fillRelated(article, manga) {
    const section = article.querySelector("#manga-related");
    const grid = article.querySelector("#manga-related-grid");
    const gens = manga.generos || [];
    if (!section || !grid || !gens.length) return;
    try {
        const all = await obterCatalogoCompleto();
        const scored = all
            .filter((m) => m.id && m.id !== manga.id)
            .map((m) => {
                const overlap = gens.filter((g) => matchGenero(m.generos, g)).length;
                return { m, overlap };
            })
            .filter((x) => x.overlap > 0)
            .sort((a, b) => b.overlap - a.overlap || (b.m.popularidade || 0) - (a.m.popularidade || 0))
            .slice(0, 8)
            .map((x) => x.m);
        if (!scored.length) return;
        grid.innerHTML = scored.map((m) => renderMangaCard(m, { overlay: true, rich: false })).join("");
        section.hidden = false;
    } catch { /* offline */ }
}
