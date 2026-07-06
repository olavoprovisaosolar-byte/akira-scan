/**
 * Retry com exponential backoff.
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseMs?: number, label?: string }} opts
 * @returns {Promise<T>}
 */
const NON_RETRYABLE = /acesso negado|não encontrado|not found|404|layout.*alterado/i;

export async function withRetry(fn, opts = {}) {
    const maxAttempts = opts.maxAttempts ?? 4;
    const baseMs = opts.baseMs ?? 400;
    const label = opts.label ?? "operation";
    let lastErr;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (NON_RETRYABLE.test(err.message || "")) {
                throw err;
            }
            const delay = baseMs * Math.pow(2, attempt - 1) + Math.random() * 200;
            console.warn(`[Retry] ${label} tentativa ${attempt}/${maxAttempts}: ${err.message}`);
            if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw lastErr;
}
