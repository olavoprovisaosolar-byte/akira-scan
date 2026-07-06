/** Estados globais de operações assíncronas — Loading | Error | Ready */

export type AsyncStatus = "idle" | "loading" | "ready" | "error";

export interface AsyncState<T> {
    status: AsyncStatus;
    data: T | null;
    error: string | null;
}

export function idleState<T>(): AsyncState<T> {
    return { status: "idle", data: null, error: null };
}

export function loadingState<T>(prev: AsyncState<T>): AsyncState<T> {
    return { ...prev, status: "loading", error: null };
}

export function readyState<T>(data: T): AsyncState<T> {
    return { status: "ready", data, error: null };
}

export function errorState<T>(message: string): AsyncState<T> {
    return { status: "error", data: null, error: message };
}

export type StatusListener = (status: AsyncStatus, error: string | null) => void;
