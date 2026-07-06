/** Tema claro/escuro — padrão escuro */
const KEY = "akirascan_theme";

export function temaAtual() {
    return localStorage.getItem(KEY) || "dark";
}

export function aplicarTema(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    localStorage.setItem(KEY, tema);
}

export function alternarTema() {
    const next = temaAtual() === "dark" ? "light" : "dark";
    aplicarTema(next);
    return next;
}

export function initTema() {
    aplicarTema(temaAtual());
}
