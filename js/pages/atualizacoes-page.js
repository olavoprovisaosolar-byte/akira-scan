/**
 * Página de atualizações — feed cronológico com tags Hot/Novo.
 */
import { obterAtualizacoes, contarAtualizacoesHoje, formatarTempoRelativo } from "../services/updates-feed.js";
import { obterManga } from "../services/data-service.js";
import { linkLeitor, linkManhwa } from "../core/router.js";
import { escHtml } from "../app-shell.js";
import { coverImgTagAttrs } from "../services/cover-utils.js";
import { mountSkeletonFeed } from "../ui/skeleton.js";

const mangaCache = new Map();

async function tituloManga(mangaId, fallback) {
    if (mangaCache.has(mangaId)) return mangaCache.get(mangaId);
    try {
        const m = await obterManga(mangaId);
        const t = m?.titulo || fallback || mangaId;
        mangaCache.set(mangaId, { titulo: t, capa: m?.capa, rating: m?.nexusRating });
        return mangaCache.get(mangaId);
    } catch {
        return { titulo: fallback || mangaId, capa: "", rating: 0 };
    }
}

function isHot(item) {
    const age = Date.now() - new Date(item.hostedAt || 0).getTime();
    return age < 6 * 3600000;
}

function isNovo(item) {
    const age = Date.now() - new Date(item.hostedAt || 0).getTime();
    return age < 48 * 3600000;
}

function agruparPorObra(itens, maxCaps = 3) {
    const map = new Map();
    for (const item of itens) {
        if (!map.has(item.mangaId)) map.set(item.mangaId, []);
        const list = map.get(item.mangaId);
        if (list.length < maxCaps) list.push(item);
    }
    return [...map.entries()].map(([mangaId, caps]) => ({ mangaId, caps }));
}

function renderGroup(group, meta) {
    const img = coverImgTagAttrs(
        { id: group.mangaId, titulo: meta.titulo, capa: meta.capa },
        { loading: "lazy" }
    );
    const caps = group.caps.map((item) => {
        const href = linkLeitor(item.mangaId, item.numero, item.capId);
        const tags = [
            isNovo(item) ? '<span class="update-tag update-tag-novo">Novo</span>' : "",
            isHot(item) ? '<span class="update-tag update-tag-hot">Hot</span>' : ""
        ].filter(Boolean).join(" ");
        return `
        <a href="${href}" class="update-group-cap">
            <span>Cap. ${escHtml(String(item.numero))}</span>
            <span class="update-time">${escHtml(formatarTempoRelativo(item.hostedAt))} ${tags}</span>
        </a>`;
    }).join("");
    return `
    <article class="update-group animate-in">
        <a href="${linkManhwa(group.mangaId)}" class="update-group-cover">
            <img class="update-cover" ${img.html}>
        </a>
        <div class="update-group-body">
            <a href="${linkManhwa(group.mangaId)}" class="update-manga">${escHtml(meta.titulo)}</a>
            ${caps}
        </div>
    </article>`;
}

function renderItem(item, meta) {
    const img = coverImgTagAttrs(
        { id: item.mangaId, titulo: meta.titulo, capa: meta.capa },
        { loading: "lazy" }
    );
    const href = linkLeitor(item.mangaId, item.numero, item.capId);
    const when = formatarTempoRelativo(item.hostedAt);
    const tags = [
        isNovo(item) ? '<span class="update-tag update-tag-novo">Novo</span>' : "",
        isHot(item) ? '<span class="update-tag update-tag-hot">Hot</span>' : ""
    ].filter(Boolean).join(" ");
    return `
    <a href="${href}" class="update-item animate-in">
        <img class="update-cover" ${img.html}>
        <div class="update-body">
            <strong class="update-manga">${escHtml(meta.titulo)}</strong>
            <span class="update-cap">Cap. ${escHtml(String(item.numero))}${item.titulo && item.titulo !== `Cap. ${item.numero}` ? ` — ${escHtml(item.titulo)}` : ""}</span>
            <span class="update-time">${escHtml(when)} ${tags}</span>
        </div>
        <span class="update-arrow">▶</span>
    </a>`;
}

export async function initAtualizacoesPage() {
    const feed = document.getElementById("updates-feed");
    const stats = document.getElementById("updates-stats");
    const filters = document.getElementById("updates-filters");
    const sortBar = document.getElementById("updates-sort");
    let dias = null;
    let sortMode = "grouped";

    async function render() {
        mountSkeletonFeed(feed, 6);
        try {
            const [itens, hoje] = await Promise.all([
                obterAtualizacoes({ limite: 80, dias }),
                contarAtualizacoesHoje()
            ]);

            let lista = [...itens];
            if (sortMode === "hot") {
                lista = lista.filter(isHot).concat(lista.filter((i) => !isHot(i)));
            }

            stats.innerHTML = `
                <span class="updates-stat"><strong>${hoje}</strong> hoje</span>
                <span class="updates-stat"><strong>${lista.length}</strong> nesta lista</span>
                <span class="updates-stat"><strong>${lista.filter(isNovo).length}</strong> novos</span>`;

            if (!lista.length) {
                feed.innerHTML = '<p class="msg-vazia">Nenhuma atualização neste período.</p>';
                return;
            }

            if (sortMode === "grouped") {
                const groups = agruparPorObra(lista);
                const html = [];
                for (const group of groups) {
                    const meta = await tituloManga(group.mangaId, group.caps[0]?.tituloManga);
                    html.push(renderGroup(group, meta));
                }
                feed.innerHTML = html.join("");
                return;
            }

            const html = [];
            for (const item of lista) {
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

    sortBar?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-sort]");
        if (!btn) return;
        sortBar.querySelectorAll(".genre-chip").forEach((c) => c.classList.remove("ativo"));
        btn.classList.add("ativo");
        sortMode = btn.dataset.sort;
        render();
    });

    await render();
}
