import { idleState, loadingState, readyState, errorState } from "../../shared/async-status.js";
export function createMangaLoader(deps) {
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
        async load(mangaId, opts = {}) {
            const token = ++generation;
            setState(loadingState(state));
            try {
                let manga = null;
                try {
                    manga = await deps.fetchRemote(mangaId, opts);
                }
                catch (remoteErr) {
                    console.warn("[MangaLoader] Remoto:", remoteErr.message);
                    manga = await deps.getOffline(mangaId);
                    if (!manga)
                        throw remoteErr;
                }
                if (token !== generation)
                    return null;
                deps.validate?.(manga, mangaId);
                if (deps.saveOffline) {
                    try {
                        await deps.saveOffline(manga);
                    }
                    catch { /* não crítico */ }
                }
                setState(readyState(manga));
                return manga;
            }
            catch (error) {
                if (token !== generation)
                    return null;
                const msg = error.message || "Erro ao carregar mangá.";
                setState(errorState(msg));
                throw error;
            }
        }
    };
}
