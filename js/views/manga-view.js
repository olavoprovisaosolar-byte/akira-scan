/**
 * View — delega renderização ao componente MangaDetails.
 */
import { MangaDetails } from "../ui/manga-details.js";
import { clearZone, ZONES } from "../core/router.js";

export class MangaView {
    constructor(container) {
        this.container = container;
        this.details = new MangaDetails(container);
    }

    setLoading(isLoading) {
        this.container.style.opacity = isLoading ? "0.55" : "1";
        this.container.style.pointerEvents = isLoading ? "none" : "";
    }

    clear() {
        this.details.clear();
    }

    showLoading(msg) {
        this.details.showLoading(msg);
    }

    showError(message, onRetry) {
        this.details.showError(message, onRetry);
    }

    render(manga, opts) {
        this.details.render(manga, opts);
    }

    /** Limpa zona de detalhes no index (SPA). */
    static clearDetailsZone() {
        clearZone(ZONES.details);
    }
}
