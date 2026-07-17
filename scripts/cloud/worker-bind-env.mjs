/**
 * Sincroniza bindings/secrets do Cloudflare Workers/Pages para process.env (Node local).
 */
function nodeEnv() {
    return typeof process !== "undefined" && process.env ? process.env : null;
}

export function bindWorkerEnv(env) {
    if (!env || typeof env !== "object") return;
    const pe = nodeEnv();
    if (!pe) return;
    for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string" && value !== "") {
            pe[key] = value;
        }
    }
}

export function envFlag(env, key) {
    const pe = nodeEnv();
    const v = env?.[key] ?? pe?.[key] ?? "";
    return Boolean(String(v).trim());
}
