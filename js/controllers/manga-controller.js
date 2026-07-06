/**
 * Controller — página manhwa.html (orientado a eventos).
 */
import { store, Events } from "../core/state-manager.js";
import { parseManhwaRoute, clearZone, ZONES } from "../core/router.js";
import { MangaService } from "../services/manga-service.js";
import { MangaView } from "../views/manga-view.js";
import { onPageRestore } from "../core/app-state.js";
import { ehFavorito, alternarFavorito } from "../storage.js";

export class MangaController {
    constructor(container) {
        this.container = container;
        this.view = new MangaView(container);
        this._mangaId = null;
        this._unsubs = [];

        this._bindStore();
        this.init();
    }

    _bindStore() {
        this._unsubs.push(
            store.subscribe(Events.MANGA_LOADING, () => {
                this.view.setLoading(true);
                this.view.showLoading();
            }),
            store.subscribe(Events.MANGA_LOADED, ({ manga }) => {
                this.view.setLoading(false);
                document.title = `${manga.titulo} — AkiraScan`;
                this.view.render(manga, {
                    favorito: ehFavorito(manga.id),
                    onFavorito: () => alternarFavorito(manga.id)
                });
            }),
            store.subscribe(Events.MANGA_ERROR, ({ error }) => {
                this.view.setLoading(false);
                this.view.showError(error || "Não foi possível carregar este mangá.", () => this.load());
            })
        );
    }

    init() {
        clearZone(this.container.id || ZONES.details);
        const route = parseManhwaRoute(new URLSearchParams(location.search));
        if (!route.ok) {
            this.view.showError(route.error, () => { location.href = "biblioteca.html"; });
            return;
        }

        this._mangaId = route.mangaId;
        onPageRestore(() => this.load());
        this.load();
    }

    async load() {
        MangaService.reset();
        this.view.clear();
        try {
            await MangaService.getMangaDetails(this._mangaId);
        } catch {
            /* erro via MANGA_ERROR */
        }
    }

    destroy() {
        this._unsubs.forEach((fn) => fn());
        MangaService.reset();
        this.view.clear();
    }
}

export function initMangaPage(container) {
    return new MangaController(container);
}
