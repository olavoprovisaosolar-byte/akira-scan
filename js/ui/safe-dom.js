/**
 * Injeção segura de DOM — imagens com validação de ID.
 */
import { escHtml } from "../app-shell.js";
import {
    buildCoverFallbacks,
    applyCoverToImg,
    installCoverFallbackHandler,
    coverPlaceholder
} from "../services/cover-utils.js";

/** Atribui src — se receber objeto manga, aplica cadeia de fallback. */
export function setImageSrc(img, urlOrManga, mangaId = "", opts = {}) {
    if (!img) return;
    if (urlOrManga && typeof urlOrManga === "object" && urlOrManga.id) {
        applyCoverToImg(img, urlOrManga, opts);
        return;
    }
    img.removeAttribute("src");
    img.src = "";
    if (mangaId) img.dataset.mangaId = mangaId;
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    requestAnimationFrame(() => {
        if (urlOrManga) img.src = urlOrManga;
    });
    img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
}

export function criarImagem({ src, alt = "", className = "", mangaId = "", manga = null }) {
    installCoverFallbackHandler();
    const img = document.createElement("img");
    if (className) img.className = className;
    img.alt = alt;

    if (manga?.id) {
        applyCoverToImg(img, manga);
        return img;
    }

    const fallbacks = [src, coverPlaceholder(mangaId, alt)].filter(Boolean);
    const primary = fallbacks[0] || coverPlaceholder(mangaId, alt);
    img.dataset.fallbacks = JSON.stringify(fallbacks.slice(1));
    setImageSrc(img, primary, mangaId);
    img.onerror = () => window.__akiraCoverFallback?.(img);
    return img;
}

/** Valida que o manga renderizado corresponde ao ID pedido. */
export function validarMangaRender(manga, expectedId) {
    if (!manga || manga.id !== expectedId) {
        throw new Error("Dados inconsistentes — mangá não corresponde ao pedido.");
    }
    return manga;
}

export function htmlSeguro(strings, ...values) {
    return strings.reduce((acc, str, i) => acc + str + (values[i] != null ? escHtml(String(values[i])) : ""), "");
}
