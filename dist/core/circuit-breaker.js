/**
 * Circuit Breaker — desabilita provedor após falhas consecutivas.
 */
import { logger } from "./logger.js";
export class CircuitBreaker {
    name;
    failures = 0;
    state = "closed";
    openedAt = 0;
    failureThreshold;
    resetMs;
    constructor(opts) {
        this.name = opts.name;
        this.failureThreshold = opts.failureThreshold ?? 3;
        this.resetMs = opts.resetMs ?? 60_000;
    }
    getState() {
        if (this.state === "open" && Date.now() - this.openedAt >= this.resetMs) {
            this.state = "half-open";
            logger.info("CircuitBreaker", `${this.name} → half-open`);
        }
        return this.state;
    }
    isAvailable() {
        return this.getState() !== "open";
    }
    async exec(fn) {
        if (!this.isAvailable()) {
            throw new Error(`Provedor ${this.name} indisponível (circuit open).`);
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (err) {
            this.onFailure(err.message);
            throw err;
        }
    }
    onSuccess() {
        this.failures = 0;
        if (this.state === "half-open") {
            this.state = "closed";
            logger.info("CircuitBreaker", `${this.name} → closed`);
        }
    }
    onFailure(message) {
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
const breakers = new Map();
export function getBreaker(name) {
    if (!breakers.has(name)) {
        breakers.set(name, new CircuitBreaker({ name }));
    }
    return breakers.get(name);
}
export function breakerStatus() {
    const out = {};
    for (const [name, b] of breakers) {
        out[name] = { state: b.getState() };
    }
    return out;
}
