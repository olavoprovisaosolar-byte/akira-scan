/**
 * Toolbar do leitor — teclado, fullscreen, zoom, ocultar chrome.
 */
export function initReaderToolbar({ leitor, area, barra, navCaps, onPrevCap, onNextCap }) {
    let zoom = 1;
    let chromeHidden = false;

    const toolbar = document.createElement("div");
    toolbar.className = "leitor-toolbar";
    toolbar.innerHTML = `
        <button type="button" class="lt-btn" data-act="zoom-out" title="Diminuir ( - )">−</button>
        <button type="button" class="lt-btn" data-act="zoom-reset" title="Zoom padrão">100%</button>
        <button type="button" class="lt-btn" data-act="zoom-in" title="Aumentar ( + )">+</button>
        <button type="button" class="lt-btn" data-act="fullscreen" title="Tela cheia (F)">⛶</button>
        <button type="button" class="lt-btn" data-act="hide-chrome" title="Ocultar barra (H)">☰</button>
    `;
    document.body.appendChild(toolbar);

    const zoomLabel = toolbar.querySelector('[data-act="zoom-reset"]');

    function applyZoom() {
        const el = area.querySelector(".meu-leitor-manga-css");
        if (el) {
            el.style.transform = zoom === 1 ? "" : `scale(${zoom})`;
            el.style.transformOrigin = "top center";
        }
        if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }

    function toggleChrome() {
        chromeHidden = !chromeHidden;
        document.body.classList.toggle("leitor-chrome-hidden", chromeHidden);
        toolbar.classList.toggle("lt-compact", chromeHidden);
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    function scrollPage(delta) {
        const imgs = [...area.querySelectorAll(".pagina-manga")];
        if (!imgs.length) return;
        const mid = window.innerHeight / 2;
        let current = 0;
        imgs.forEach((img, i) => {
            const r = img.getBoundingClientRect();
            if (r.top <= mid && r.bottom >= mid) current = i;
        });
        const target = Math.max(0, Math.min(imgs.length - 1, current + delta));
        imgs[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    toolbar.addEventListener("click", (e) => {
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (act === "zoom-in") { zoom = Math.min(2, +(zoom + 0.1).toFixed(2)); applyZoom(); }
        if (act === "zoom-out") { zoom = Math.max(0.6, +(zoom - 0.1).toFixed(2)); applyZoom(); }
        if (act === "zoom-reset") { zoom = 1; applyZoom(); }
        if (act === "fullscreen") toggleFullscreen();
        if (act === "hide-chrome") toggleChrome();
    });

    document.addEventListener("keydown", (e) => {
        if (e.target.matches("input, textarea, select")) return;
        const k = e.key.toLowerCase();
        if (k === "f" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleFullscreen(); }
        if (k === "h" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleChrome(); }
        if (k === "+" || k === "=") { e.preventDefault(); zoom = Math.min(2, +(zoom + 0.1).toFixed(2)); applyZoom(); }
        if (k === "-") { e.preventDefault(); zoom = Math.max(0.6, +(zoom - 0.1).toFixed(2)); applyZoom(); }
        if (k === "0") { e.preventDefault(); zoom = 1; applyZoom(); }
        if (k === "arrowdown" || k === "j") { e.preventDefault(); scrollPage(1); }
        if (k === "arrowup" || k === "k") { e.preventDefault(); scrollPage(-1); }
        if (k === "arrowleft" || k === "a") {
            if (e.shiftKey) { e.preventDefault(); onPrevCap?.(); }
            else { e.preventDefault(); scrollPage(-1); }
        }
        if (k === "arrowright" || k === "d") {
            if (e.shiftKey) { e.preventDefault(); onNextCap?.(); }
            else { e.preventDefault(); scrollPage(1); }
        }
    });

    return {
        destroy() {
            toolbar.remove();
            document.body.classList.remove("leitor-chrome-hidden");
        }
    };
}
