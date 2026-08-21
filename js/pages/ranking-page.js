import { obterCatalogoCompleto } from "../services/data-service.js";
import { rankingSemanal, rankingMensal, rankingGeral } from "../mangas-destaque.js";
import { renderRankingItem } from "../app-shell.js";

function tabAtual() {
    const t = (new URLSearchParams(location.search).get("tab") || "semanal").toLowerCase();
    if (t === "mensal" || t === "geral") return t;
    return "semanal";
}

export async function initRankingPage() {
    const list = document.getElementById("ranking-list");
    const tabs = document.getElementById("ranking-tabs");
    const title = document.getElementById("ranking-heading");
    if (!list) return;

    const catalogo = await obterCatalogoCompleto();
    let tab = tabAtual();

    function paint() {
        tabs?.querySelectorAll("[data-tab]").forEach((btn) => {
            btn.classList.toggle("ativo", btn.dataset.tab === tab);
        });
        const labels = { semanal: "Ranking semanal", mensal: "Ranking mensal", geral: "Ranking geral" };
        if (title) title.textContent = labels[tab] || labels.semanal;
        const fn = tab === "mensal" ? rankingMensal : tab === "geral" ? rankingGeral : rankingSemanal;
        const itens = fn(catalogo, 50);
        list.innerHTML = itens.length
            ? itens.map((m) => renderRankingItem(m)).join("")
            : '<p class="msg-vazia">Ranking indisponível.</p>';
        const q = tab === "semanal" ? "ranking.html" : `ranking.html?tab=${tab}`;
        history.replaceState({}, "", q);
        document.title = `${labels[tab]} — AkiraScan`;
    }

    tabs?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tab]");
        if (!btn) return;
        tab = btn.dataset.tab || "semanal";
        paint();
    });

    paint();
}
