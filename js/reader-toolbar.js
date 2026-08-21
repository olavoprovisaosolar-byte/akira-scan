/**
 * Controles do leitor — apenas passador lateral (rail).
 */
import { renderComentariosSection, bindComentarios } from "./comments.js";
import { linkLeitor } from "./core/router.js";

function escHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function initReaderToolbar({
    area,
    barra,
    barraFill = null,
    mangaId = null,
    chapters = [],
    canPrev = false,
    canNext = false,
    onPrevCap,
    onNextCap,
    onSelectCap = null
}) {
    let chromeHidden = false;
    let autoHide = localStorage.getItem("akira_reader_autohide") !== "0";
    let zoomWidth = Number(localStorage.getItem("akira_reader_zoom") || 800);
    let readerMode = localStorage.getItem("akira_reader_mode") === "paged" ? "paged" : "webtoon";
    let pagedIndex = 0;
    const MIN_W = 300;
    const MAX_W = 1400;

    const main = document.getElementById("reader-main") || area;
    const rail = document.getElementById("reader-rail");
    const backdrop = document.getElementById("reader-drawer-backdrop");
    const drawers = {
        toc: document.getElementById("drawer-toc"),
        settings: document.getElementById("drawer-settings"),
        comments: document.getElementById("drawer-comments"),
        report: document.getElementById("drawer-report")
    };

    const resolvedMangaId = mangaId
        || new URLSearchParams(location.search).get("m")
        || new URLSearchParams(location.search).get("id")
        || (location.pathname.split("/").filter(Boolean)[0] === "obra"
            ? decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "")
            : null)
        || null;

    applyZoomWidth();
    applyReaderMode();
    setCapNavEnabled(canPrev, canNext);
    wireRail();

    function applyZoomWidth() {
        document.documentElement.style.setProperty("--nx-page-max", `${zoomWidth}px`);
        const stack = area.querySelector(".meu-leitor-manga-css");
        if (stack) stack.style.maxWidth = `${zoomWidth}px`;
        localStorage.setItem("akira_reader_zoom", String(zoomWidth));
        syncZoomUi();
    }

    function syncZoomUi() {
        const range = document.getElementById("setting-zoom");
        const out = document.getElementById("setting-zoom-val");
        if (range && Number(range.value) !== zoomWidth) range.value = String(zoomWidth);
        if (out) out.textContent = `${zoomWidth}px`;
    }

    function setZoom(next) {
        zoomWidth = Math.max(MIN_W, Math.min(MAX_W, next));
        applyZoomWidth();
    }

    function setChromeHidden(hidden) {
        chromeHidden = Boolean(hidden);
        document.body.classList.toggle("leitor-chrome-hidden", chromeHidden);
    }

    function toggleChrome() {
        setChromeHidden(!chromeHidden);
    }

    function applyReaderMode() {
        document.body.classList.toggle("leitor-paged", readerMode === "paged");
        localStorage.setItem("akira_reader_mode", readerMode);
        const sel = document.getElementById("setting-reader-mode");
        if (sel && sel.value !== readerMode) sel.value = readerMode;
        pagedIndex = currentPageIndex();
        syncPagedCurrent(pagedIndex);
    }

    function currentPageIndex() {
        const imgs = [...area.querySelectorAll(".pagina-manga")];
        if (!imgs.length) return 0;
        const mid = window.innerHeight / 2;
        let current = 0;
        imgs.forEach((img, i) => {
            const r = img.getBoundingClientRect();
            if (r.top <= mid && r.bottom >= mid) current = i;
        });
        return current;
    }

    function syncPagedCurrent(index = currentPageIndex()) {
        const wraps = [...area.querySelectorAll(".pagina-wrap")];
        wraps.forEach((w, i) => w.classList.toggle("is-current", i === index));
    }

    function setCapNavEnabled(prevOk, nextOk) {
        const railPrev = document.getElementById("rail-prev");
        const railNext = document.getElementById("rail-next");
        if (railPrev) railPrev.disabled = !prevOk;
        if (railNext) railNext.disabled = !nextOk;
    }

    function scrollPage(delta) {
        const imgs = [...area.querySelectorAll(".pagina-manga")];
        if (!imgs.length) return;
        if (readerMode === "paged") {
            pagedIndex = Math.max(0, Math.min(imgs.length - 1, pagedIndex + delta));
            syncPagedCurrent(pagedIndex);
            imgs[pagedIndex]?.scrollIntoView({ behavior: "auto", block: "start" });
            return;
        }
        const current = currentPageIndex();
        const target = Math.max(0, Math.min(imgs.length - 1, current + delta));
        imgs[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeDrawers() {
        Object.values(drawers).forEach((el) => {
            if (el) el.hidden = true;
        });
        if (backdrop) backdrop.hidden = true;
        document.body.classList.remove("reader-drawer-open");
    }

    function openDrawer(key) {
        closeDrawers();
        const el = drawers[key];
        if (!el) return;
        el.hidden = false;
        if (backdrop) backdrop.hidden = false;
        document.body.classList.add("reader-drawer-open");
        setChromeHidden(false);
    }

    function buildToc() {
        const list = document.getElementById("drawer-toc-list");
        if (!list) return;
        if (!chapters.length) {
            list.innerHTML = '<p class="rail-hint">Nenhum capítulo disponível.</p>';
            return;
        }
        list.innerHTML = chapters.map((cap) => {
            const cur = cap.current ? " is-current" : "";
            return `<button type="button" class="rail-toc-item${cur}" data-id="${escHtml(cap.id)}" data-n="${escHtml(String(cap.n))}">${escHtml(cap.label)}</button>`;
        }).join("");

        list.onclick = (e) => {
            const btn = e.target.closest(".rail-toc-item");
            if (!btn) return;
            const cap = { id: btn.dataset.id, n: btn.dataset.n };
            if (onSelectCap) onSelectCap(cap);
            else if (resolvedMangaId) {
                location.href = linkLeitor(resolvedMangaId, cap.n, cap.id);
            }
        };
    }

    function openComments() {
        const body = document.getElementById("drawer-comments-body");
        if (!body) return;
        if (!resolvedMangaId) {
            body.innerHTML = '<p class="rail-hint">Comentários indisponíveis neste modo.</p>';
            openDrawer("comments");
            return;
        }
        body.innerHTML = renderComentariosSection(resolvedMangaId, escHtml);
        bindComentarios(body, resolvedMangaId, escHtml);
        openDrawer("comments");
    }

    const abort = new AbortController();
    const { signal } = abort;

    function wireRail() {
        const stop = (fn) => (e) => {
            e.stopPropagation();
            e.preventDefault();
            fn?.(e);
        };

        document.getElementById("rail-prev")?.addEventListener("click", stop(() => onPrevCap?.()), { signal });
        document.getElementById("rail-next")?.addEventListener("click", stop(() => onNextCap?.()), { signal });
        document.getElementById("rail-zoom-in")?.addEventListener("click", stop(() => setZoom(zoomWidth + 100)), { signal });
        document.getElementById("rail-zoom-out")?.addEventListener("click", stop(() => setZoom(zoomWidth - 100)), { signal });
        document.getElementById("rail-top")?.addEventListener("click", stop(() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }), { signal });
        document.getElementById("rail-toc")?.addEventListener("click", stop(() => {
            buildToc();
            openDrawer("toc");
        }), { signal });
        document.getElementById("rail-settings")?.addEventListener("click", stop(() => {
            const ah = document.getElementById("setting-autohide");
            if (ah) ah.checked = autoHide;
            const modeSel = document.getElementById("setting-reader-mode");
            if (modeSel) modeSel.value = readerMode;
            syncZoomUi();
            openDrawer("settings");
        }), { signal });
        document.getElementById("rail-comments")?.addEventListener("click", stop(openComments), { signal });
        document.getElementById("rail-report")?.addEventListener("click", stop(() => openDrawer("report")), { signal });

        backdrop?.addEventListener("click", closeDrawers, { signal });
        document.querySelectorAll("[data-close-drawer]").forEach((btn) => {
            btn.addEventListener("click", stop(closeDrawers), { signal });
        });

        document.getElementById("setting-zoom")?.addEventListener("input", (e) => {
            setZoom(Number(e.target.value));
        }, { signal });
        document.getElementById("setting-autohide")?.addEventListener("change", (e) => {
            autoHide = Boolean(e.target.checked);
            localStorage.setItem("akira_reader_autohide", autoHide ? "1" : "0");
            if (!autoHide) setChromeHidden(false);
        }, { signal });
        document.getElementById("setting-reader-mode")?.addEventListener("change", (e) => {
            readerMode = e.target.value === "paged" ? "paged" : "webtoon";
            applyReaderMode();
        }, { signal });

        document.getElementById("report-form")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const motivo = String(fd.get("motivo") || "").trim();
            const status = document.getElementById("report-status");
            const payload = {
                url: location.href,
                mangaId: resolvedMangaId,
                motivo,
                ts: Date.now()
            };
            try {
                const key = "akira_reader_reports";
                const prev = JSON.parse(localStorage.getItem(key) || "[]");
                prev.unshift(payload);
                localStorage.setItem(key, JSON.stringify(prev.slice(0, 30)));
            } catch { /* quota */ }
            if (status) {
                status.hidden = false;
                status.textContent = "Report guardado. Obrigado!";
            }
            e.target.reset();
            setTimeout(closeDrawers, 900);
        }, { signal });
    }

    function onMainClick(e) {
        if (e.target.closest("button, a, select, .pagina-retry, .leitor-fim-cap, .reader-header, .reader-rail, .reader-drawer, .reader-drawer-backdrop")) {
            return;
        }
        const rect = main.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const w = rect.width || window.innerWidth;
        if (x < w * 0.3) {
            scrollPage(-1);
            return;
        }
        if (x > w * 0.7) {
            scrollPage(1);
            return;
        }
        toggleChrome();
    }

    let lastY = window.scrollY;
    let ticking = false;
    function onScroll() {
        if (!autoHide || ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            const dy = y - lastY;
            if (y < 40) setChromeHidden(false);
            else if (dy > 10) setChromeHidden(true);
            else if (dy < -12) setChromeHidden(false);
            lastY = y;
            ticking = false;
        });
    }

    function onKeydown(e) {
        if (e.target.matches("input, textarea, select")) return;
        const k = e.key.toLowerCase();
        if (k === "escape") {
            e.preventDefault();
            if (!backdrop?.hidden) closeDrawers();
            else setChromeHidden(false);
        }
        if (k === "h") {
            e.preventDefault();
            toggleChrome();
        }
        if (k === "+" || k === "=") {
            e.preventDefault();
            setZoom(zoomWidth + 100);
        }
        if (k === "-") {
            e.preventDefault();
            setZoom(zoomWidth - 100);
        }
        if (k === "arrowdown" || k === "j" || k === " ") { e.preventDefault(); scrollPage(1); }
        if (k === "arrowup" || k === "k") { e.preventDefault(); scrollPage(-1); }
        if (k === "arrowleft" || k === "a") {
            e.preventDefault();
            if (e.shiftKey) onPrevCap?.();
            else scrollPage(-1);
        }
        if (k === "arrowright" || k === "d") {
            e.preventDefault();
            if (e.shiftKey) onNextCap?.();
            else scrollPage(1);
        }
    }

    main.addEventListener("click", onMainClick);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKeydown);

    if (barra && barraFill) {
        const obs = new MutationObserver(() => {
            const w = barra.style.width || "0%";
            barraFill.style.width = w;
        });
        obs.observe(barra, { attributes: true, attributeFilter: ["style"] });
        barra._nxObs = obs;
    }

    return {
        setChromeHidden,
        toggleChrome,
        applyZoomWidth,
        setCapNavEnabled,
        closeDrawers,
        destroy() {
            abort.abort();
            main.removeEventListener("click", onMainClick);
            window.removeEventListener("scroll", onScroll);
            document.removeEventListener("keydown", onKeydown);
            document.body.classList.remove("leitor-chrome-hidden", "reader-drawer-open");
            closeDrawers();
            if (barra?._nxObs) {
                barra._nxObs.disconnect();
                delete barra._nxObs;
            }
        }
    };
}
