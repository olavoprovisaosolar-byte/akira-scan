/**
 * Papéis da conta — Admin / Dev. O dono do site fica pinado aqui.
 */
export const STAFF_EMAILS = {
    "lukaassouzaz@gmail.com": "admin"
};

export const STAFF_USERNAMES = {
    akirascan: "admin"
};

const ROLES = new Set(["admin", "dev"]);

export function normalizarPapel(raw) {
    const r = String(raw || "").trim().toLowerCase();
    return ROLES.has(r) ? r : "leitor";
}

export function rotuloPapel(role) {
    if (role === "admin") return "Admin";
    if (role === "dev") return "Dev";
    return "Leitor";
}

export function resolverPapel({ email = "", username = "", role = "" } = {}, env = {}) {
    const e = String(email || "").trim().toLowerCase();
    const u = String(username || "").trim().toLowerCase().replace(/^@+/, "");
    if (STAFF_EMAILS[e]) return STAFF_EMAILS[e];
    if (STAFF_USERNAMES[u]) return STAFF_USERNAMES[u];

    const extraAdmin = String(env.AKIRA_STAFF_ADMIN || "")
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const extraDev = String(env.AKIRA_STAFF_DEV || "")
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    if (extraAdmin.includes(e) || extraAdmin.includes(u)) return "admin";
    if (extraDev.includes(e) || extraDev.includes(u)) return "dev";

    return normalizarPapel(role);
}
