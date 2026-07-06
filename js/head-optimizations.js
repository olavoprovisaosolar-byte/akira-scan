/**
 * Preload/prefetch de recursos críticos — injetado no boot das páginas.
 */
import { assetUrl, isStaticHost } from "./site-config.js";

export function injectHeadOptimizations() {
    if (typeof document === "undefined") return;
    const head = document.head;
    if (!head || head.dataset.akiraOpt) return;
    head.dataset.akiraOpt = "1";

    const preloads = [
        { href: assetUrl("data/catalogo-index.json"), as: "fetch", crossOrigin: "anonymous" },
        { href: assetUrl("css/akira.css"), as: "style" }
    ];

    if (isStaticHost()) {
        preloads.push({
            href: assetUrl("data/cloud/chapters-index.json"),
            as: "fetch",
            crossOrigin: "anonymous"
        });
    }

    for (const item of preloads) {
        if (head.querySelector(`link[rel="preload"][href="${item.href}"]`)) continue;
        const link = document.createElement("link");
        link.rel = "preload";
        link.href = item.href;
        link.as = item.as;
        if (item.crossOrigin) link.crossOrigin = item.crossOrigin;
        head.appendChild(link);
    }

    if (!head.querySelector('link[rel="dns-prefetch"][href*="placehold.co"]')) {
        const dns = document.createElement("link");
        dns.rel = "dns-prefetch";
        dns.href = "https://placehold.co";
        head.appendChild(dns);
    }
}
