/**
 * Hook de carregamento de capítulo — Cache Local → API → Persist → Render.
 */
import type { AsyncState, AsyncStatus, StatusListener } from "../../shared/async-status.js";
import {
    idleState,
    loadingState,
    readyState,
    errorState
} from "../../shared/async-status.js";

export interface PageRef {
    index: number;
    url: string;
}

export interface ChapterLoaderDeps {
    getOffline: (mangaId: string, chapterId: string) => Promise<PageRef[] | null>;
    fetchRemote: (
        mangaId: string,
        numeroCap: string | number,
        chapterId: string,
        opts?: { source?: string; manga?: unknown }
    ) => Promise<PageRef[]>;
    saveOffline: (mangaId: string, chapterId: string, pages: PageRef[]) => Promise<void>;
}

export interface ChapterLoader {
    load: (
        mangaId: string,
        numeroCap: string | number,
        chapterId: string,
        opts?: { source?: string; manga?: unknown }
    ) => Promise<PageRef[] | null>;
    getState: () => AsyncState<PageRef[]>;
    subscribe: (fn: StatusListener) => () => void;
    reset: () => void;
}

export function createChapterLoader(deps: ChapterLoaderDeps): ChapterLoader {
    let state: AsyncState<PageRef[]> = idleState();
    const listeners = new Set<StatusListener>();
    let generation = 0;

    function notify() {
        listeners.forEach((fn) => fn(state.status, state.error));
    }

    function setState(next: AsyncState<PageRef[]>) {
        state = next;
        notify();
    }

    return {
        getState: () => state,

        subscribe(fn: StatusListener) {
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
                let pages: PageRef[] | null = null;
                let fonte = "offline";

                try {
                    pages = await deps.getOffline(mangaId, chapterId);
                } catch { /* continua */ }

                if (pages?.length) {
                    if (token !== generation) return null;
                    setState(readyState(pages));
                    return pages;
                }

                fonte = "remote";
                pages = await deps.fetchRemote(mangaId, numeroCap, chapterId, opts);

                if (token !== generation) return null;

                if (!Array.isArray(pages) || !pages.length) {
                    throw new Error("Capítulo sem páginas.");
                }

                try {
                    await deps.saveOffline(mangaId, chapterId, pages);
                } catch (e) {
                    console.warn("[ChapterLoader] Falha ao persistir offline:", (e as Error).message);
                }

                setState(readyState(pages));
                console.debug(`[ChapterLoader] ${fonte} — ${pages.length} páginas`);
                return pages;
            } catch (error) {
                if (token !== generation) return null;

                try {
                    const offline = await deps.getOffline(mangaId, chapterId);
                    if (offline?.length) {
                        setState(readyState(offline));
                        return offline;
                    }
                } catch { /* continua */ }

                const msg = (error as Error).message || "Erro ao carregar capítulo.";
                setState(errorState(msg));
                throw error;
            }
        }
    };
}

export type { AsyncStatus };
