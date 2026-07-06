/**
 * HealthCheck — monitora provedores; aviso só se o catálogo também falhar.
 */
import { isStaticHost } from "./site-config.js";
let lastStatus = { ok: true, providers: {}, ingestion: null };
let catalogDisponivel = false;

/** Chamado pela home quando o catálogo carregou com sucesso. */
export function markCatalogLoaded(ok = true) {
    catalogDisponivel = Boolean(ok);
}

export function isCatalogLoaded() {
    return catalogDisponivel;
}

export async function checkProviders() {
    try {
        const res = await fetch("/api/v1/proxy/health", { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        lastStatus = data;
        return data;
    } catch {
        try {
            const res = await fetch("/data/ingestion-status.json", { signal: AbortSignal.timeout(6000) });
            if (res.ok) {
                const ingestion = await res.json();
                lastStatus = { ok: ingestion.ok !== false, providers: {}, ingestion };
                return lastStatus;
            }
        } catch { /* ignore */ }
        lastStatus = { ok: false, providers: {}, ingestion: null };
        return lastStatus;
    }
}

/**
 * @param {string} slotId
 * @param {{ catalogCount?: number }} opts — se catalogCount > 0, não exibe erro de fonte
 */
export function renderProviderBanner(slotId = "aviso-servidor", opts = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const count = opts.catalogCount ?? (catalogDisponivel ? 1 : 0);
    if (count > 0 || catalogDisponivel || isStaticHost()) {
        slot.innerHTML = "";
        slot.classList.remove("aviso-ativo");
        return;
    }

    checkProviders().then((status) => {
        if (catalogDisponivel || count > 0) {
            slot.innerHTML = "";
            slot.classList.remove("aviso-ativo");
            return;
        }

        const ingestion = status.ingestion;
        const ingestionFailed = ingestion && ingestion.ok === false;

        if (status.ok && !ingestionFailed) {
            slot.innerHTML = "";
            slot.classList.remove("aviso-ativo");
            return;
        }

        if (ingestionFailed && ingestion.userMessage) {
            slot.innerHTML = `<p class="aviso-provedor">${escapeHtml(String(ingestion.userMessage))}</p>`;
            slot.classList.add("aviso-ativo");
            return;
        }

        const down = Object.entries(status.providers || {})
            .filter(([, v]) => !v)
            .map(([k]) => k);
        slot.innerHTML = `<p class="aviso-provedor">Fonte indisponível temporariamente (${down.join(", ") || "rede"}). A usar catálogo local…</p>`;
        slot.classList.add("aviso-ativo");
    });
}

function escapeHtml(t = "") {
    return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function getLastHealth() {
    return lastStatus;
}
