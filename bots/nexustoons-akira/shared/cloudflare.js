/**
 * Detecta bloqueio Cloudflare / WAF em respostas HTTP da NexusToons.
 */

const CF_BODY = /<!DOCTYPE html|Just a moment|cf-browser-verification|challenge-platform|Attention Required|cf-error|cdn-cgi\/challenge/i;

export function isCloudflareBlocked(status, body) {
    if (status !== 403 && status !== 429 && status !== 503 && status !== 1020) return false;
    if (body && typeof body === "object" && !Array.isArray(body) && body.error && !body.html) {
        return false;
    }
    const text = typeof body === "string"
        ? body
        : Buffer.isBuffer(body)
            ? body.toString("utf8")
            : "";
    if (!text) return status === 403 || status === 429 || status === 1020;
    return CF_BODY.test(text) || status === 403 || status === 429;
}

export function isCloudflareError(err) {
    const msg = String(err?.message || err || "");
    return /HTTP 403|HTTP 429|HTTP 503|Just a moment|challenge-platform|cf-browser/i.test(msg);
}
