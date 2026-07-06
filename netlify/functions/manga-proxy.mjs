/**
 * Proxy AkiraScan — delega ao handler TypeScript compilado (dist/server/proxy).
 * Fallback para implementação MJS se dist não existir (dev sem build).
 */
let handler;

try {
    handler = (await import("../../dist/server/proxy/handler.js")).default;
} catch {
    console.warn("[manga-proxy] dist não encontrado — fallback MJS legacy.");
    handler = (await import("./manga-proxy-legacy.mjs")).default;
}

export default handler;
export const config = { path: "/api/v1/proxy/*" };
