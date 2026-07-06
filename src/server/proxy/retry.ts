const NON_RETRYABLE = /acesso negado|não encontrado|not found|404|layout.*alterado/i;

export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: { maxAttempts?: number; baseMs?: number; label?: string } = {}
): Promise<T> {
    const maxAttempts = opts.maxAttempts ?? 4;
    const baseMs = opts.baseMs ?? 400;
    const label = opts.label ?? "operation";
    let lastErr: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err instanceof Error ? err : new Error(String(err));
            if (NON_RETRYABLE.test(lastErr.message)) throw lastErr;
            const delay = baseMs * Math.pow(2, attempt - 1) + Math.random() * 200;
            console.warn(`[Retry] ${label} tentativa ${attempt}/${maxAttempts}: ${lastErr.message}`);
            if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw lastErr ?? new Error("Retry esgotado.");
}
