/**
 * Preferências do perfil / UI (tema accent, toggles, listas de leitura).
 */
const PREFS_KEY = "akirascan_prefs_v1";
const LISTAS_KEY = "akirascan_listas_v1";

export const THEME_SWATCHES = [
    { id: "amber", label: "Âmbar", color: "#f59e0b", light: "#fbbf24", dark: "#d97706" },
    { id: "pink", label: "Rosa", color: "#ec4899", light: "#f472b6", dark: "#db2777" },
    { id: "violet", label: "Violeta", color: "#a855f7", light: "#c084fc", dark: "#7c3aed" },
    { id: "blue", label: "Azul", color: "#3b82f6", light: "#60a5fa", dark: "#2563eb" },
    { id: "emerald", label: "Esmeralda", color: "#10b981", light: "#34d399", dark: "#059669" },
    { id: "red", label: "Vermelho", color: "#ef4444", light: "#f87171", dark: "#dc2626" },
    { id: "indigo", label: "Índigo", color: "#6366f1", light: "#818cf8", dark: "#4f46e5" },
    { id: "cyan", label: "Ciano", color: "#06b6d8", light: "#22d3ee", dark: "#0891b2" }
];

const DEFAULT_PREFS = {
    accent: "violet",
    notifComments: true,
    showContinuarHome: true,
    cadastradoEm: null,
    ultimaVisita: null
};

function lerJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
        return fallback;
    }
}

function guardarJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota */ }
}

export function obterPrefs() {
    return { ...DEFAULT_PREFS, ...lerJson(PREFS_KEY, {}) };
}

export function guardarPrefs(patch = {}) {
    const next = { ...obterPrefs(), ...patch };
    guardarJson(PREFS_KEY, next);
    return next;
}

export function tocarVisita() {
    const prefs = obterPrefs();
    const now = new Date().toISOString();
    const patch = { ultimaVisita: now };
    if (!prefs.cadastradoEm) patch.cadastradoEm = now;
    return guardarPrefs(patch);
}

export function aplicarAccent(accentId = "violet") {
    const swatch = THEME_SWATCHES.find((s) => s.id === accentId) || THEME_SWATCHES[2];
    const root = document.documentElement;
    root.style.setProperty("--akira-purple", swatch.color);
    root.style.setProperty("--akira-purple-light", swatch.light);
    root.style.setProperty("--akira-purple-dark", swatch.dark);
    root.style.setProperty("--akira-purple-glow", `${swatch.color}66`);
    root.setAttribute("data-accent", swatch.id);
    guardarPrefs({ accent: swatch.id });
    return swatch;
}

export function initAccentFromPrefs() {
    const { accent } = obterPrefs();
    return aplicarAccent(accent || "violet");
}

/** @returns {Record<string, 'lendo'|'favorito'|'lido'|'interessado'|'pausado'|'dropado'>} */
export function obterListasStatus() {
    return lerJson(LISTAS_KEY, {});
}

export function obterStatusManga(mangaId) {
    if (!mangaId) return "";
    return obterListasStatus()[mangaId] || "";
}

export function substituirListasStatus(map = {}) {
    const next = map && typeof map === "object" ? { ...map } : {};
    guardarJson(LISTAS_KEY, next);
    return next;
}

export function mesclarListasStatus(remoto = {}) {
    const local = obterListasStatus();
    const next = { ...(remoto && typeof remoto === "object" ? remoto : {}), ...local };
    guardarJson(LISTAS_KEY, next);
    return next;
}

export function definirStatusManga(mangaId, status) {
    if (!mangaId) return obterListasStatus();
    const map = obterListasStatus();
    if (!status) delete map[mangaId];
    else map[mangaId] = status;
    guardarJson(LISTAS_KEY, map);
    import("./storage.js").then((m) => m.agendarSyncNuvem?.()).catch(() => {});
    return map;
}

export function idsPorStatus(status) {
    return Object.entries(obterListasStatus())
        .filter(([, s]) => s === status)
        .map(([id]) => id);
}

export function formatarDataCurta(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("pt-BR");
    } catch {
        return "—";
    }
}

export function formatarVisitaRelativa(iso) {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const diff = Date.now() - t;
    if (diff < 60_000) return "Agora mesmo";
    if (diff < 3_600_000) return `Há ${Math.floor(diff / 60_000)}min`;
    if (diff < 86_400_000) return `Há ${Math.floor(diff / 3_600_000)}h`;
    return formatarDataCurta(iso);
}
