import { obterHistorico, limparHistorico } from "../storage.js";
import { obterManga } from "../services/data-service.js";
import { linkLeitor, linkManhwa } from "../core/router.js";
import { escHtml } from "../app-shell.js";
import { coverImgTagAttrs } from "../services/cover-utils.js";
import { normalizarNumeroProgresso } from "../services/chapter-label.js";

function continuarHref(h) {
    const capNum = normalizarNumeroProgresso(h.capitulo_atual, h.chapterId);
    if (!h.mangaId || !capNum) return linkManhwa(h.mangaId);
    let url = linkLeitor(h.mangaId, capNum, h.chapterId || null);
    if (h.paginaAtual > 1) url += `${url.includes("?") ? "&" : "?"}p=${h.paginaAtual}`;
    return url;
}

function formatWhen(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
        return new Date(n).toLocaleString("pt-BR");
    } catch {
        return "";
    }
}

export async function initHistoricoPage() {
    const list = document.getElementById("historico-list");
    const empty = document.getElementById("historico-empty");
    const clearBtn = document.getElementById("historico-clear");
    if (!list) return;

    const entries = Object.values(obterHistorico())
        .filter((h) => h?.mangaId)
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));

    if (!entries.length) {
        if (empty) empty.hidden = false;
        list.innerHTML = "";
        return;
    }
    if (empty) empty.hidden = true;

    const html = [];
    for (const h of entries) {
        let titulo = h.titulo || h.mangaId;
        let capa = h.capa || "";
        try {
            const m = await obterManga(h.mangaId);
            titulo = m?.titulo || titulo;
            capa = m?.capa || capa;
        } catch { /* offline */ }
        const capNum = normalizarNumeroProgresso(h.capitulo_atual, h.chapterId);
        const img = coverImgTagAttrs({ id: h.mangaId, titulo, capa }, { loading: "lazy" });
        html.push(`
        <article class="historico-item">
            <a href="${linkManhwa(h.mangaId)}" class="historico-cover"><img ${img.html} alt=""></a>
            <div class="historico-body">
                <a href="${linkManhwa(h.mangaId)}"><strong>${escHtml(titulo)}</strong></a>
                <span>Cap. ${escHtml(String(capNum || 1))}${h.paginaAtual > 1 ? ` · pág. ${escHtml(String(h.paginaAtual))}` : ""}</span>
                <span class="historico-when">${escHtml(formatWhen(h.atualizadoEm))}</span>
            </div>
            <a href="${continuarHref(h)}" class="btn-akira btn-akira-primary">Continuar</a>
        </article>`);
    }
    list.innerHTML = html.join("");

    clearBtn?.addEventListener("click", () => {
        if (!confirm("Limpar todo o histórico de leitura neste dispositivo?")) return;
        limparHistorico();
        location.reload();
    });
}
