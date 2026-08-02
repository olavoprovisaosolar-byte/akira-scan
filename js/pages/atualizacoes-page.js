/**
 * Página de atualizações — feed cronológico do índice cloud.
 */
import { obterAtualizacoes, contarAtualizacoesHoje, formatarTempoRelativo } from "../services/updates-feed.js";
import { obterManga } from "../services/data-service.js";
import { linkLeitor, linkManhwa } from "../core/router.js";
import { escHtml } from "../app-shell.js";
import { coverImgTagAttrs } from "../services/cover-utils.js";

const mangaCache = new Map();

async function tituloManga(mangaId, fallback) {
    if (mangaCache.has(mangaId)) return mangaCache.get(mangaId);
    try {
        const m = await obterManga(mangaId);
        const t = m?.titulo || fallback || mangaId;
        mangaCache.set(mangaId, { titulo: t, capa: m?.capa });
        return mangaCache.get(mangaId);
    } catch {
        return { titulo: fallback || mangaId, capa: "" };
    }
}

function renderItem(item, meta) {
    const img = coverImgTagAttrs(
        { id: item.mangaId, titulo: meta.titulo, capa: meta.capa },
        { loading: "lazy" }
    );
    const href = linkLeitor(item.mangaId, item.numero, item.capId);
    const when = formatarTempoRelativo(item.hostedAt);
    return `
    <a href="${href}" class="update-item">
        <img class="update-cover" ${img.html}>
        <div class="update-body">
            <strong class="update-manga">${escHtml(meta.titulo)}</strong>
            <span class="update-cap">Cap. ${escHtml(String(item.numero))}${item.titulo && item.titulo !== `Cap. ${item.numero}` ? ` — ${escHtml(item.titulo)}` : ""}</span>
            <span class="update-time">${escHtml(when)}</span>
        </div>
        <span class="update-arrow">▶</span>
    </a>`;
}

export async function initAtualizacoesPage() {
    const feed = document.getElementById("updates-feed");
    const stats = document.getElementById("updates-stats");
    const filters = document.getElementById("updates-filters");
    let dias = null;

    async function render() {
        feed.innerHTML = '<p class="msg-vazia">A carregar…</p>';
        try {
            const [itens, hoje] = await Promise.all([
                obterAtualizacoes({ limite: 80, dias }),
                contarAtualizacoesHoje()
            ]);
            stats.innerHTML = `
                <span class="updates-stat"><strong>${hoje}</strong> hoje</span>
                <span class="updates-stat"><strong>${itens.length}</strong> nesta lista</span>`;

            if (!itens.length) {
                feed.innerHTML = '<p class="msg-vazia">Nenhuma atualização neste período.</p>';
                return;
            }

            const html = [];
            for (const item of itens) {
                const meta = await tituloManga(item.mangaId, item.tituloManga);
                html.push(renderItem(item, meta));
            }
            feed.innerHTML = html.join("");
        } catch (e) {
            feed.innerHTML = `<p class="msg-vazia">Erro: ${escHtml(e.message)}</p>`;
        }
    }

    filters?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-dias]");
        if (!btn) return;
        filters.querySelectorAll(".genre-chip").forEach((c) => c.classList.remove("ativo"));
        btn.classList.add("ativo");
        const v = btn.dataset.dias;
        dias = v ? Number(v) : null;
        render();
    });

    await render();
}
