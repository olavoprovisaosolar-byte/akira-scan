/**
 * Retry com backoff exponencial para HTTP 429/503.
 * Delays: 2s → 4s → 8s, depois falha.
 */

const BACKOFF_MS = [2000, 4000, 8000];

export function isRetryableStatus(status) {
    return status === 429 || status === 503;
}

export function isRetryableNetworkError(err) {
    const status = err?.status ?? err?.response?.status;
    if (isRetryableStatus(status)) return true;
    const msg = String(err?.message || err || "");
    return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|EPIPE|ENOTFOUND/i.test(msg);
}

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {() => Promise<T>} fn
 * @param {{ label?: string, onRetry?: (attempt: number, delayMs: number, err: Error) => void }} [opts]
 * @returns {Promise<T>}
 */
export async function withExponentialBackoff(fn, opts = {}) {
    let lastErr = null;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            const status = e.status ?? e.response?.status;
            if (!isRetryableNetworkError(e) || attempt >= BACKOFF_MS.length) {
                throw e;
            }
            const delayMs = BACKOFF_MS[attempt];
            opts.onRetry?.(attempt + 1, delayMs, e);
            await sleep(delayMs);
        }
    }
    throw lastErr || new Error("retry esgotado");
}
