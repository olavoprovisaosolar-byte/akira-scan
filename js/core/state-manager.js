/**
 * Gerenciador de estado orientado a eventos.
 * UI subscreve eventos — nunca acede ao DOM a partir do service layer.
 */
export const Events = Object.freeze({
    RESET: "state:reset",
    LOADING: "state:loading",
    LOADED: "state:loaded",
    ERROR: "state:error",
    MANGA_LOADING: "manga:loading",
    MANGA_LOADED: "manga:loaded",
    MANGA_ERROR: "manga:error",
    LEITOR_LOADING: "leitor:loading",
    LEITOR_READY: "leitor:ready",
    LEITOR_ERROR: "leitor:error",
    OFFLINE_SAVED: "offline:saved"
});

class StateManager {
    constructor() {
        this._state = {
            status: "idle",
            loading: false,
            manga: null,
            mangaId: null,
            paginas: null,
            error: null,
            fonte: null
        };
        this._listeners = new Map();
        this._generation = 0;
    }

    get state() {
        return { ...this._state };
    }

    subscribe(event, handler) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(handler);
        return () => this._listeners.get(event)?.delete(handler);
    }

    dispatch(event, payload = {}) {
        for (const fn of this._listeners.get(event) || []) {
            try {
                fn(payload, this._state);
            } catch (e) {
                console.error(`[Store] Handler erro (${event}):`, e);
            }
        }
    }

    setState(partial) {
        this._state = { ...this._state, ...partial };
    }

    beginRequest() {
        const token = ++this._generation;
        return {
            token,
            isStale: () => token !== this._generation
        };
    }

    reset() {
        this._generation += 1;
        this._state = {
            status: "idle",
            loading: false,
            manga: null,
            mangaId: null,
            paginas: null,
            error: null,
            fonte: null
        };
        this.dispatch(Events.RESET);
    }
}

export const store = new StateManager();
