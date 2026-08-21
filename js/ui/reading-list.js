import { ehFavorito, alternarFavorito } from "../storage.js";
import { definirStatusManga, obterListasStatus } from "../perfil-prefs.js";

export const LISTA_OPCOES = [
    { value: "", label: "Adicionar à lista" },
    { value: "lendo", label: "Lendo" },
    { value: "favorito", label: "Favorito" },
    { value: "lido", label: "Lido" },
    { value: "interessado", label: "Interessado" },
    { value: "pausado", label: "Pausado" },
    { value: "dropado", label: "Dropado" }
];

export function obterListaAtual(mangaId) {
    if (!mangaId) return "";
    const st = obterListasStatus()[mangaId];
    if (st === "favorito") return ehFavorito(mangaId) ? "favorito" : "";
    if (st) return st;
    return "";
}

export function aplicarLista(mangaId, status) {
    if (!mangaId) return obterListaAtual(mangaId);
    if (!status) {
        const previa = obterListaAtual(mangaId);
        definirStatusManga(mangaId, null);
        if (previa === "favorito" && ehFavorito(mangaId)) alternarFavorito(mangaId);
        return "";
    }
    if (status === "favorito") {
        definirStatusManga(mangaId, "favorito");
        if (!ehFavorito(mangaId)) alternarFavorito(mangaId);
        return "favorito";
    }
    definirStatusManga(mangaId, status);
    return status;
}
