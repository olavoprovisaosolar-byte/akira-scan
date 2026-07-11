/**
 * PerformanceMonitor — FPS e tempo de carregamento (rodapé, dev-friendly).
 */
let rafId = 0;
let frames = 0;
let lastTs = performance.now();
let fps = 0;

function tick(now) {
    frames += 1;
    if (now - lastTs >= 1000) {
        fps = frames;
        frames = 0;
        lastTs = now;
        const el = document.getElementById("perf-monitor");
        if (el) {
            const nav = performance.getEntriesByType("navigation")[0];
            const loadMs = nav ? Math.round(nav.loadEventEnd) : 0;
            el.textContent = `FPS ${fps} · Load ${loadMs}ms`;
        }
    }
    rafId = requestAnimationFrame(tick);
}

export function startPerformanceMonitor() {
    const debug = new URLSearchParams(location.search).has("debug")
        || localStorage.getItem("akira-debug") === "1"
        || /localhost|127\.0\.0\.1/.test(location.hostname);
    if (!debug) return;
    if (document.getElementById("perf-monitor")) return;
    const el = document.createElement("div");
    el.id = "perf-monitor";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;bottom:4px;right:8px;font-size:10px;opacity:0.45;z-index:9999;pointer-events:none;font-family:monospace;color:#a855f7";
    document.body.appendChild(el);
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
}

export function stopPerformanceMonitor() {
    cancelAnimationFrame(rafId);
    document.getElementById("perf-monitor")?.remove();
}
