export type BreakerState = "closed" | "open" | "half-open";
export interface BreakerOptions {
    failureThreshold?: number;
    resetMs?: number;
    name: string;
}
export declare class CircuitBreaker {
    readonly name: string;
    private failures;
    private state;
    private openedAt;
    private readonly failureThreshold;
    private readonly resetMs;
    constructor(opts: BreakerOptions);
    getState(): BreakerState;
    isAvailable(): boolean;
    exec<T>(fn: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    reset(): void;
}
export declare function getBreaker(name: string): CircuitBreaker;
export declare function breakerStatus(): Record<string, {
    state: BreakerState;
}>;
