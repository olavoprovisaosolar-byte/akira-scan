/**
 * Estado global da sessão — previne race conditions e capas erradas.
 */
class AppState {
    constructor() {
        this._generation = 0;
        this._mangaId = null;
        this._manga = null;
    }

    /** Inicia uma operação async; descarte resultados se isStale() for true. */
    beginLoad() {
        const token = ++this._generation;
        return {
            token,
            isStale: () => token !== this._generation
        };
    }

    reset() {
        this._generation += 1;
        this._mangaId = null;
        this._manga = null;
    }

    setManga(manga) {
        this._manga = manga;
        this._mangaId = manga?.id ?? null;
    }

    get mangaId() {
        return this._mangaId;
    }

    get manga() {
        return this._manga;
    }
}

export const appState = new AppState();

/** Limpa imagens e filhos — evita sobreposição de capas entre navegações. */
export function limparContainer(container) {
    if (!container) return;
    container.querySelectorAll("img").forEach((img) => {
        img.removeAttribute("src");
        img.src = "";
    });
    container.replaceChildren();
}

/** Regista handler para restauração via bfcache (voltar/avançar do browser). */
export function onPageRestore(callback) {
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            appState.reset();
            callback();
        }
    });
}

/** Invalida cache de imagens ao sair da página. */
export function onPageLeave() {
    window.addEventListener("pagehide", () => {
        document.querySelectorAll("[data-manga-id] img, .manga-hero-bg, .manga-hero-capa").forEach((img) => {
            img.removeAttribute("src");
        });
    });
}

onPageLeave();
