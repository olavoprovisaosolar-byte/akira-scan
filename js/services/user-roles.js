/**
 * Papéis visíveis na UI (espelha functions/lib/user-roles.js).
 */
const STAFF_EMAILS = {
    "lukaassouzaz@gmail.com": "admin"
};

const STAFF_USERNAMES = {
    akirascan: "admin"
};

export function resolverPapel({ email = "", username = "", role = "" } = {}) {
    const e = String(email || "").trim().toLowerCase();
    const u = String(username || "").trim().toLowerCase().replace(/^@+/, "");
    if (STAFF_EMAILS[e]) return STAFF_EMAILS[e];
    if (STAFF_USERNAMES[u]) return STAFF_USERNAMES[u];
    const r = String(role || "").trim().toLowerCase();
    if (r === "admin" || r === "dev") return r;
    return "leitor";
}

export function rotuloPapel(role) {
    if (role === "admin") return "Admin";
    if (role === "dev") return "Dev";
    return "Leitor";
}
