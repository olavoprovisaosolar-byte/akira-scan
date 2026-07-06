import { idleState, loadingState, readyState, errorState } from "../../shared/async-status.js";

function isRealPages(pages) {
    if (!Array.isArray(pages) || !pages.length) return false;
    const urls = pages.map((p) => (typeof p === "string" ? p : p?.url || "")).filter(Boolean);
    if (!urls.length) return false;
    if (urls.every((u) => u.includes("placehold.co"))) return false;
    return true;
}
export function createChapterLoader(deps) {
    let state = idleState();
    const listeners = new Set();
    let generation = 0;
    function notify() {
        listeners.forEach((fn) => fn(state.status, state.error));
    }
    function setState(next) {
        state = next;
        notify();
    }
    return {
        getState: () => state,
        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
        reset() {
            generation += 1;
            state = idleState();
            notify();
        },
        async load(mangaId, numeroCap, chapterId, opts = {}) {
            const token = ++generation;
            setState(loadingState(state));
            try {
                let pages = null;
                let fonte = "offline";
                try {
                    pages = await deps.getOffline(mangaId, chapterId);
                }
                catch { /* continua */ }
                if (pages?.length && isRealPages(pages)) {
                    if (token !== generation)
                        return null;
                    setState(readyState(pages));
                    return pages;
                }
                fonte = "remote";
                pages = await deps.fetchRemote(mangaId, numeroCap, chapterId, opts);
                if (token !== generation)
                    return null;
                if (!Array.isArray(pages) || !pages.length) {
                    throw new Error("Capítulo sem páginas.");
                }
                if (isRealPages(pages)) {
                    try {
                        await deps.saveOffline(mangaId, chapterId, pages);
                    }
                    catch (e) {
                        console.warn("[ChapterLoader] Falha ao persistir offline:", e.message);
                    }
                }
                setState(readyState(pages));
                console.debug(`[ChapterLoader] ${fonte} — ${pages.length} páginas`);
                return pages;
            }
            catch (error) {
                if (token !== generation)
                    return null;
                try {
                    const offline = await deps.getOffline(mangaId, chapterId);
                    if (offline?.length && isRealPages(offline)) {
                        setState(readyState(offline));
                        return offline;
                    }
                }
                catch { /* continua */ }
                const msg = error.message || "Erro ao carregar capítulo.";
                setState(errorState(msg));
                throw error;
            }
        }
    };
}
