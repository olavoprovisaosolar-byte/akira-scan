/** Estados globais de operações assíncronas — Loading | Error | Ready */
export type AsyncStatus = "idle" | "loading" | "ready" | "error";
export interface AsyncState<T> {
    status: AsyncStatus;
    data: T | null;
    error: string | null;
}
export declare function idleState<T>(): AsyncState<T>;
export declare function loadingState<T>(prev: AsyncState<T>): AsyncState<T>;
export declare function readyState<T>(data: T): AsyncState<T>;
export declare function errorState<T>(message: string): AsyncState<T>;
export type StatusListener = (status: AsyncStatus, error: string | null) => void;
