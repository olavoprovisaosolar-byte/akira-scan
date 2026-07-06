/**
 * clearState — purga DOM, imagens e estado antes de novo mangá/capítulo.
 */
import { appState, limparContainer } from "./app-state.js";

/** Limpa referências de imagens em todo o documento do leitor. */
export function purgeImageRefs(root = document) {
    root.querySelectorAll("img").forEach((img) => {
        img.removeAttribute("src");
        img.src = "";
        img.removeAttribute("srcset");
    });
}

/**
 * Clean State severo — chamar antes de carregar novo id de mangá.
 * @param {HTMLElement|null} container
 */
export function clearState(container = null) {
    appState.reset();
    purgeImageRefs(document);
    if (container) limparContainer(container);
}

export { limparContainer, appState };
