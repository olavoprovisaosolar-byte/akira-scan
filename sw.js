/**
 * Service Worker — cache estático + catálogo stale-while-revalidate.
 */
const CACHE_STATIC = "akirascan-static-v25";
const CACHE_DATA = "akirascan-data-v25";

const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/biblioteca.html",
    "/manhwa.html",
    "/leitor.html",
    "/css/akira.css",
    "/css/leitor.css",
    "/js/brand.js",
    "/js/site-config.js"
];

const DATA_ASSETS = [
    "data/catalogo-index.json",
    "data/cloud/chapters-index.json"
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
                    .filter((k) => k.startsWith("akirascan-") && k !== CACHE_STATIC && k !== CACHE_DATA)
                    .map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== location.origin) return;
    if (event.request.method !== "GET") return;

    if (DATA_ASSETS.some((p) => url.pathname.endsWith(p.replace(/^\//, "")) || url.pathname === p)) {
        event.respondWith(staleWhileRevalidate(event.request, CACHE_DATA));
        return;
    }

    if (
        url.pathname.endsWith(".js")
        || url.pathname.endsWith(".html")
        || url.pathname.endsWith(".css")
        || url.pathname.startsWith("/img/")
        || url.pathname.includes("/cover.")
    ) {
        event.respondWith(networkFirstStatic(event.request));
    }
});

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
    }).catch(() => null);
    return cached || network || new Response("{}", { status: 503 });
}

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
