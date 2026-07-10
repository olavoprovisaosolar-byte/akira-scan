/**
 * Grid de capítulos — validação antes de redirecionar.
 */
import { escHtml } from "../app-shell.js";
import { linkLeitor } from "../core/router.js";
import { parseChapterNumber } from "../services/chapter-label.js";

export function contarCapsLegiveis(manga) {
    const caps = manga?.capitulos || [];
    const legiveis = caps.filter((c) => c.legivel !== false && c.id).length;
    return { total: caps.length, legiveis };
}

export function primeiroCapLegivel(manga) {
    const caps = [...(manga?.capitulos || [])]
        .filter((c) => c.id && c.legivel !== false)
        .sort((a, b) => parseChapterNumber(a) - parseChapterNumber(b));
    return caps[0] || null;
}

function capValido(cap) {
    const num = parseChapterNumber(cap);
    const baseValid = cap.id && Number.isFinite(Number(num)) && Number(num) > 0;
    return { num, baseValid, valido: baseValid && cap.legivel !== false };
}

export function renderChapterGrid(manga, { filter = "all" } = {}) {
    let caps = [...(manga.capitulos || [])].sort(
        (a, b) => parseChapterNumber(b) - parseChapterNumber(a)
    );

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
            ? "Nenhum capítulo pronto ainda — a sincronização continua em segundo plano."
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
    if (!host || !filters.length) return;

    const apply = (filter) => {
        filters.forEach((btn) => {
            const active = btn.dataset.filter === filter;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
        });
        host.innerHTML = renderChapterGrid(manga, { filter });
        bindChapterGrid(host, manga, { onInvalid });
    };

    filters.forEach((btn) => {
        btn.addEventListener("click", () => apply(btn.dataset.filter || "all"));
    });
}
