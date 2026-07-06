/**
 * Catálogo da pasta Biblioteca_Mangas (armazenamento local).
 */
import { isStaticHost } from "./site-config.js";

const API = "/api/biblioteca";
const API_TIMEOUT_MS = 45000;

async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Biblioteca indisponível");
        return data;
    } finally {
        clearTimeout(timer);
    }
}

export async function bibliotecaDisponivel() {
    if (isStaticHost()) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(API, { signal: controller.signal, method: "HEAD" });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export async function listarMangasBiblioteca() {
    const data = await fetchJson(API);
    return data.mangas || [];
}

export async function obterMangaBiblioteca(mangaId) {
    const data = await fetchJson(`${API}/${encodeURIComponent(mangaId)}`);
    return data.manga;
}

export async function obterPaginasBiblioteca(mangaId, capituloId) {
    const data = await fetchJson(
        `${API}/${encodeURIComponent(mangaId)}/${encodeURIComponent(capituloId)}`
    );
    return data.pages || [];
}
