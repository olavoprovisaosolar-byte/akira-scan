/**
 * Grid de capítulos — validação antes de redirecionar.
 */
import { escHtml } from "../app-shell.js";
import { linkLeitor } from "../core/router.js";
import { parseChapterNumber } from "../services/chapter-label.js";

export function capsVisiveis(manga) {
    return (manga?.capitulos || []).filter((c) => c.id && c.legivel === true);
}

export function capsTodos(manga) {
    const seen = new Set();
    return (manga?.capitulos || []).filter((c) => {
        if (!c.id || Number(parseChapterNumber(c)) <= 0) return false;
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
    });
}

export function contarCapsLegiveis(manga) {
    const todos = capsTodos(manga);
    const legiveis = todos.filter((c) => c.legivel === true).length;
    return { total: todos.length, legiveis };
}

export function primeiroCapLegivel(manga) {
    const caps = [...capsVisiveis(manga)]
        .sort((a, b) => parseChapterNumber(a) - parseChapterNumber(b));
    return caps[0] || null;
}

function capValido(cap) {
    const num = parseChapterNumber(cap);
    const baseValid = cap.id && Number.isFinite(Number(num)) && Number(num) > 0;
    return { num, baseValid, valido: baseValid && cap.legivel === true };
}

function dataCap(cap) {
    return cap?.publicadoEm || cap?.hostedAt || cap?.atualizadoEm || cap?.data || "";
}

function formatarDataCap(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t) || t <= 0) return "";
    try {
        return new Date(t).toLocaleDateString("pt-BR");
    } catch {
        return "";
    }
}

export function renderChapterGrid(manga, { filter = "all", sort = "desc" } = {}) {
    let caps = capsTodos(manga).sort((a, b) => {
        const diff = parseChapterNumber(b) - parseChapterNumber(a);
        return sort === "asc" ? -diff : diff;
    });

    if (filter === "ready") {
        caps = caps.filter((c) => capValido(c).valido);
    } else if (filter === "soon") {
        caps = caps.filter((c) => {
            const { baseValid, valido } = capValido(c);
            return baseValid && !valido;
        });
    }

    if (!caps.length) {
        const emptyMsg = filter === "ready"
            ? "Nenhum capítulo pronto ainda — upload em andamento (Telegra/Freeimage)."
            : filter === "soon"
                ? "Todos os capítulos listados já estão prontos."
                : "Nenhum capítulo disponível.";
        return `<p class="msg-vazia">${emptyMsg}</p>`;
    }

    return `
    <div class="chapter-grid" role="list" data-filter="${escHtml(filter)}">
        ${caps.map((cap) => {
            const { num, baseValid, valido } = capValido(cap);
            const href = valido ? linkLeitor(manga.id, num, cap.id) : "#";
            const badge = cap.novo ? `<span class="chapter-badge">Novo</span>` : "";
            const statusBadge = !baseValid
                ? ""
                : valido
                    ? `<span class="chapter-badge chapter-badge-ready" title="Pronto para ler">Ler</span>`
                    : `<span class="chapter-badge chapter-badge-soon" title="A sincronizar">Em breve</span>`;
            return `
            <a href="${href}"
               class="chapter-card${valido ? "" : " chapter-card-disabled"}"
               role="listitem"
               data-manga-id="${escHtml(manga.id)}"
               data-cap-num="${escHtml(String(num))}"
               data-cap-id="${escHtml(cap.id || "")}"
               ${valido ? "" : 'aria-disabled="true" tabindex="-1"'}
               data-valid="${valido}">
                <span class="chapter-num">Cap. ${escHtml(String(num))}</span>
                ${formatarDataCap(dataCap(cap)) ? `<span class="chapter-date">${escHtml(formatarDataCap(dataCap(cap)))}</span>` : ""}
                ${badge}${statusBadge}
                <span class="chapter-action btn-akira btn-akira-sm ${valido ? "btn-akira-primary" : "btn-akira-ghost"}">${valido ? "Abrir" : "Aguarde"}</span>
            </a>`;
        }).join("")}
    </div>`;
}

export function renderChapterToolbar(manga) {
    const { total, legiveis } = contarCapsLegiveis(manga);
    const pct = total > 0 ? Math.round((legiveis / total) * 100) : 0;
    return `
    <div class="chapter-toolbar">
        <div class="chapter-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Capítulos prontos">
            <div class="chapter-progress-bar" style="width:${pct}%"></div>
            <span class="chapter-progress-label">${legiveis} de ${total} prontos (${pct}%)</span>
        </div>
        <div class="chapter-filters" role="tablist" aria-label="Filtrar capítulos">
            <button type="button" class="chapter-filter is-active" data-filter="all" role="tab" aria-selected="true">Todos</button>
            <button type="button" class="chapter-filter" data-filter="ready" role="tab" aria-selected="false">Prontos</button>
            <button type="button" class="chapter-filter" data-filter="soon" role="tab" aria-selected="false">Em breve</button>
        </div>
        <div class="chapter-sort" role="group" aria-label="Ordenar capítulos">
            <button type="button" class="chapter-sort-btn is-active" data-sort="desc">Recentes</button>
            <button type="button" class="chapter-sort-btn" data-sort="asc">Antigos</button>
        </div>
    </div>`;
}

export function bindChapterGrid(container, manga, { onInvalid } = {}) {
    container.querySelectorAll(".chapter-card").forEach((el) => {
        el.addEventListener("click", (e) => {
            if (el.dataset.valid !== "true") {
                e.preventDefault();
                onInvalid?.("Este capítulo ainda está a sincronizar. Escolhe um com badge Ler.");
                return;
            }
            const num = Number(el.dataset.capNum);
            const capId = el.dataset.capId;
            if (!capId || !Number.isFinite(num) || num <= 0) {
                e.preventDefault();
                onInvalid?.("Parâmetros do capítulo inválidos.");
            }
        });
    });
}

export function bindChapterToolbar(root, manga, { onInvalid } = {}) {
    const host = root.querySelector(".chapter-grid-host");
    const filters = root.querySelectorAll(".chapter-filter");
    const sorts = root.querySelectorAll(".chapter-sort-btn");
    if (!host || !filters.length) return;

    let filter = "all";
    let sort = "desc";

    const apply = () => {
        filters.forEach((btn) => {
            const active = btn.dataset.filter === filter;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });
        sorts.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.sort === sort));
        host.innerHTML = renderChapterGrid(manga, { filter, sort });
        bindChapterGrid(host, manga, { onInvalid });
    };

    filters.forEach((btn) => {
        btn.addEventListener("click", () => {
            filter = btn.dataset.filter || "all";
            apply();
        });
    });
    sorts.forEach((btn) => {
        btn.addEventListener("click", () => {
            sort = btn.dataset.sort || "desc";
            apply();
        });
    });
}
