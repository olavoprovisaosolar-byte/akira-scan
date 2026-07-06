/** Registo do Service Worker — invalida caches antigos ao mudar versão. */
const CACHE_VERSION = "v11";

async function limparCachesAkira() {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(
        keys.filter((k) => k.startsWith("akirascan-")).map((k) => caches.delete(k))
    );
}

export function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    window.addEventListener("load", async () => {
        try {
            const prev = localStorage.getItem("akira-cache-version");
            if (prev !== CACHE_VERSION) {
                await limparCachesAkira();
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) await reg.unregister();
                localStorage.setItem("akira-cache-version", CACHE_VERSION);
            }

            const reg = await navigator.serviceWorker.register(`/sw.js?${CACHE_VERSION}`);
            await reg.update();
            if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        } catch (err) {
            console.warn("[SW] Registo falhou:", err.message);
        }
    });
}
