/**
 * Hook de carregamento de mangá — Clean State + anti-race.
 */
import type { AsyncState, AsyncStatus, StatusListener } from "../../shared/async-status.js";
import {
    idleState,
    loadingState,
    readyState,
    errorState
} from "../../shared/async-status.js";

export interface MangaLoaderDeps<T> {
    getOffline: (mangaId: string) => Promise<T | null>;
    fetchRemote: (mangaId: string, opts?: { source?: string }) => Promise<T>;
    saveOffline?: (manga: T) => Promise<void>;
    validate?: (manga: T, expectedId: string) => void;
}

export interface MangaLoader<T> {
    load: (mangaId: string, opts?: { source?: string }) => Promise<T | null>;
    getState: () => AsyncState<T>;
    subscribe: (fn: StatusListener) => () => void;
    reset: () => void;
}

export function createMangaLoader<T extends { id: string }>(
    deps: MangaLoaderDeps<T>
): MangaLoader<T> {
    let state: AsyncState<T> = idleState();
    const listeners = new Set<StatusListener>();
    let generation = 0;

    function notify() {
        listeners.forEach((fn) => fn(state.status, state.error));
    }

    function setState(next: AsyncState<T>) {
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

        async load(mangaId, opts = {}) {
            const token = ++generation;
            setState(loadingState(state));

            try {
                let manga: T | null = null;

                try {
                    manga = await deps.fetchRemote(mangaId, opts);
                } catch (remoteErr) {
                    console.warn("[MangaLoader] Remoto:", (remoteErr as Error).message);
                    manga = await deps.getOffline(mangaId);
                    if (!manga) throw remoteErr;
                }

                if (token !== generation) return null;

                deps.validate?.(manga, mangaId);

                if (deps.saveOffline) {
                    try {
                        await deps.saveOffline(manga);
                    } catch { /* não crítico */ }
                }

                setState(readyState(manga));
                return manga;
            } catch (error) {
                if (token !== generation) return null;
                const msg = (error as Error).message || "Erro ao carregar mangá.";
                setState(errorState(msg));
                throw error;
            }
        }
    };
}

export type { AsyncStatus };
