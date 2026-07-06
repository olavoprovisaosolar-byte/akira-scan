/**
 * Grid de capítulos — validação antes de redirecionar.
 */
import { escHtml } from "../app-shell.js";
import { linkLeitor } from "../core/router.js";
import { parseChapterNumber } from "../services/chapter-label.js";

export function renderChapterGrid(manga, { onSelect } = {}) {
    const caps = [...(manga.capitulos || [])].sort(
        (a, b) => parseChapterNumber(b) - parseChapterNumber(a)
    );

    if (!caps.length) {
        return `<p class="msg-vazia">Nenhum capítulo disponível.</p>`;
    }

    return `
    <div class="chapter-grid" role="list">
        ${caps.map((cap) => {
            const num = parseChapterNumber(cap);
            const baseValid = cap.id && Number.isFinite(Number(num)) && Number(num) > 0;
            const valido = baseValid && cap.legivel !== false;
            const href = valido ? linkLeitor(manga.id, num, cap.id) : "#";
            const badge = cap.novo ? `<span class="chapter-badge">Novo</span>` : "";
            const indisponivel = baseValid && !valido
                ? `<span class="chapter-badge chapter-badge-soon" title="Em breve">⏳</span>`
                : "";
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
                ${badge}${indisponivel}
                <span class="chapter-action btn-akira btn-akira-sm btn-akira-primary">Ler</span>
            </a>`;
        }).join("")}
    </div>`;
}

export function bindChapterGrid(container, manga, { onInvalid } = {}) {
    container.querySelectorAll(".chapter-card").forEach((el) => {
        el.addEventListener("click", (e) => {
            if (el.dataset.valid !== "true") {
                e.preventDefault();
                onInvalid?.("Capítulo inválido ou indisponível.");
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
