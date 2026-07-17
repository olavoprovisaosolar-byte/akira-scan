const CACHE = "akira-worker-v2";
const SHELL = ["/mobile/", "/mobile/index.html", "/mobile/app.css", "/mobile/app.js", "/mobile/manifest.json"];

self.addEventListener("install", (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;
    const url = new URL(e.request.url);
    if (!url.pathname.startsWith("/mobile/")) return;
    e.respondWith(
        caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
});
