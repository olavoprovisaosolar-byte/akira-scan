/**
 * Bottom Navigation — mobile (< 768px)
 */
import { escHtml, paginaAtual } from "../app-shell.js";

const ITEMS = [
    { href: "index.html", icon: "🏠", label: "Início", id: "home" },
    { href: "biblioteca.html", icon: "📚", label: "Biblioteca", id: "bib" },
    { href: "atualizacoes.html", icon: "📡", label: "Novos", id: "updates" },
    { href: "biblioteca.html?q=favoritos", icon: "💖", label: "Favoritos", id: "favs" },
    { href: "perfil.html", icon: "👤", label: "Perfil", id: "perfil" }
];

function currentPage() {
    return paginaAtual();
}

function isFavoritosView() {
    const q = new URLSearchParams(location.search);
    return q.get("q") === "favoritos";
}

function isActive(item) {
    const p = currentPage();
    const favs = isFavoritosView();

    if (item.id === "favs") return p === "biblioteca.html" && favs;
    if (item.id === "bib") return p === "biblioteca.html" && !favs;
    if (item.id === "home") return p === "index.html" || p === "";
    if (item.id === "updates") return p === "atualizacoes.html";
    if (item.id === "perfil") return p === "perfil.html";
    return false;
}

export function renderBottomNav() {
    return `
    <nav class="akira-bottom-nav" id="akira-bottom-nav" aria-label="Navegação principal">
        ${ITEMS.map((item) => {
            const on = isActive(item);
            return `
            <a href="${item.href}" class="bottom-nav-item${on ? " ativo" : ""}"${on ? ' aria-current="page"' : ""}>
                <span class="bottom-nav-icon" aria-hidden="true">${item.icon}</span>
                <span class="bottom-nav-label">${escHtml(item.label)}</span>
            </a>`;
        }).join("")}
    </nav>`;
}

export function initBottomNav() {
    if (!document.body.classList.contains("akira-app")) return;
    if (document.getElementById("akira-bottom-nav")) return;

    document.body.insertAdjacentHTML("beforeend", renderBottomNav());
    document.body.classList.add("has-bottom-nav");
}
