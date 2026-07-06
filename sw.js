/**
 * Service Worker — estático cache + API network-first (evita dados stale).
 */
const CACHE_STATIC = "akirascan-static-v14";
const CACHE_API = "akirascan-api-v14";

const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/biblioteca.html",
    "/manhwa.html",
    "/leitor.html",
    "/perfil.html",
    "/css/akira.css",
    "/css/leitor.css",
    "/js/brand.js"
];

self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.warn("[SW] install parcial:", err);
                return self.skipWaiting();
            })
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k.startsWith("akirascan-") && k !== CACHE_STATIC && k !== CACHE_API)
                    .map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;
    if (event.request.method !== "GET") return;

    const isApi =
        url.pathname.startsWith("/api/biblioteca/")
        || url.pathname.startsWith("/api/manga/")
        || url.pathname.startsWith("/api/v1/proxy/")
        || url.pathname.startsWith("/api/catalogo/");

    const skipCache =
        url.pathname === "/data/catalogo.json"
        || url.pathname === "/data/catalogo-index.json"
        || url.pathname === "/data/terabox/chapters-index.json"
        || url.pathname === "/api/biblioteca";

    if (skipCache) {
        event.respondWith(fetch(event.request));
        return;
    }

    if (isApi) {
        event.respondWith(networkFirstApi(event.request));
        return;
    }

    if (
        url.pathname.endsWith(".js")
        || url.pathname.endsWith(".html")
        || url.pathname.endsWith(".css")
        || url.pathname.startsWith("/img/")
    ) {
        event.respondWith(networkFirstStatic(event.request));
    }
});

async function networkFirstStatic(request) {
    try {
        const res = await fetch(request);
        if (res.ok) {
            const cache = await caches.open(CACHE_STATIC);
            cache.put(request, res.clone());
        }
        return res;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.url.endsWith(".html")) {
            return caches.match("/index.html");
        }
        throw new Error("offline");
    }
}

async function networkFirstApi(request) {
    try {
        const res = await fetch(request);
        if (res.ok) {
            const cache = await caches.open(CACHE_API);
            cache.put(request, res.clone());
        }
        return res;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: "Offline — dados indisponíveis." }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
        });
    }
}
