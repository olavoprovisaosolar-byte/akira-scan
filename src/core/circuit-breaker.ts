/**
 * Circuit Breaker — desabilita provedor após falhas consecutivas.
 */
import { logger } from "./logger.js";

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
    failureThreshold?: number;
    resetMs?: number;
    name: string;
}

export class CircuitBreaker {
    readonly name: string;
    private failures = 0;
    private state: BreakerState = "closed";
    private openedAt = 0;
    private readonly failureThreshold: number;
    private readonly resetMs: number;

    constructor(opts: BreakerOptions) {
        this.name = opts.name;
        this.failureThreshold = opts.failureThreshold ?? 3;
        this.resetMs = opts.resetMs ?? 60_000;
    }

    getState(): BreakerState {
        if (this.state === "open" && Date.now() - this.openedAt >= this.resetMs) {
            this.state = "half-open";
            logger.info("CircuitBreaker", `${this.name} → half-open`);
        }
        return this.state;
    }

    isAvailable(): boolean {
        return this.getState() !== "open";
    }

    async exec<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.isAvailable()) {
            throw new Error(`Provedor ${this.name} indisponível (circuit open).`);
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (err) {
            this.onFailure((err as Error).message);
            throw err;
        }
    }

    private onSuccess() {
        this.failures = 0;
        if (this.state === "half-open") {
            this.state = "closed";
            logger.info("CircuitBreaker", `${this.name} → closed`);
        }
    }

    private onFailure(message: string) {
        this.failures += 1;
        logger.warn("CircuitBreaker", `${this.name} falha ${this.failures}/${this.failureThreshold}`, { message });
        if (this.failures >= this.failureThreshold) {
            this.state = "open";
            this.openedAt = Date.now();
            logger.error("CircuitBreaker", `${this.name} → OPEN`);
        }
    }

    reset() {
        this.failures = 0;
        this.state = "closed";
        this.openedAt = 0;
    }
}

const breakers = new Map<string, CircuitBreaker>();

export function getBreaker(name: string): CircuitBreaker {
    if (!breakers.has(name)) {
        breakers.set(name, new CircuitBreaker({ name }));
    }
    return breakers.get(name)!;
}

export function breakerStatus(): Record<string, { state: BreakerState }> {
    const out: Record<string, { state: BreakerState }> = {};
    for (const [name, b] of breakers) {
        out[name] = { state: b.getState() };
    }
    return out;
}
