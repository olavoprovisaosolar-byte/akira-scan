export const ZONES = {
    hero: "hero-section",
    categories: "categories-section",
    details: "details-section",
    detailsRoot: "details-root",
    reader: "reader-section"
};
function ensureDetailsRoot() {
    let root = document.getElementById(ZONES.detailsRoot);
    if (root)
        return root;
    const section = document.getElementById(ZONES.details);
    if (!section)
        return null;
    root = document.createElement("div");
    root.id = ZONES.detailsRoot;
    section.appendChild(root);
    return root;
}
const MANGA_ID_RE = /^[a-z0-9][a-z0-9-]{0,120}$/i;
function obraFromPath(pathname = typeof location !== "undefined" ? location.pathname : "") {
    const parts = String(pathname || "").replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts[0] !== "obra" || !parts[1])
        return null;
    try {
        return {
            mangaId: decodeURIComponent(parts[1]),
            cap: parts[2] ? decodeURIComponent(parts[2]) : null
        };
    }
    catch {
        return { mangaId: parts[1], cap: parts[2] || null };
    }
}
export function parseRoute(searchParams = new URLSearchParams(location.search)) {
    const obra = obraFromPath();
    const viewRaw = (searchParams.get("view") || "").trim();
    let view = viewRaw === "details" ? "details"
        : viewRaw === "reader" ? "reader"
            : "home";
    let mangaId = (searchParams.get("id") || searchParams.get("m") || "").trim() || null;
    let capRaw = searchParams.get("n") || searchParams.get("cap");
    const chapterId = searchParams.get("ch") || searchParams.get("chapterId") || null;
    if (obra) {
        mangaId = mangaId || obra.mangaId;
        if (obra.cap) {
            capRaw = capRaw || obra.cap;
            view = "reader";
        }
        else {
            view = "details";
        }
    }
    const chapterNum = capRaw ? Number(capRaw) : null;
    return { view, mangaId, chapterNum, chapterId };
}
export function validateMangaId(mangaId) {
    if (!mangaId)
        return { ok: false, error: "ID do mangá ausente na URL." };
    if (!MANGA_ID_RE.test(mangaId))
        return { ok: false, error: "ID do mangá inválido." };
    return { ok: true, mangaId };
}
/** Limpa zona de renderização — proibido manter restos de conteúdo anterior. */
export function clearZone(zoneId) {
    const el = document.getElementById(zoneId);
    if (!el)
        return null;
    el.querySelectorAll("img").forEach((img) => {
        img.removeAttribute("src");
        img.src = "";
        img.removeAttribute("srcset");
    });
    el.replaceChildren();
    return el;
}
/** Mostra apenas a view ativa; esconde as demais zonas principais. */
export function showView(view) {
    const hero = document.getElementById(ZONES.hero);
    const categories = document.getElementById(ZONES.categories);
    const details = document.getElementById(ZONES.details);
    const reader = document.getElementById(ZONES.reader);
    const homeExtras = [
        document.getElementById("home-stats-strip"),
        document.getElementById("home-quick-nav"),
        document.getElementById("aviso-servidor")
    ];
    const showHome = view === "home";
    const showDetails = view === "details";
    const showReader = view === "reader";
    if (hero)
        hero.hidden = !showHome;
    if (categories)
        categories.hidden = !showHome;
    homeExtras.forEach((el) => {
        if (el) el.hidden = !showHome;
    });
    if (details)
        details.hidden = !showDetails;
    if (reader)
        reader.hidden = !showReader;
    document.body.classList.toggle("view-details", showDetails);
    document.body.classList.toggle("view-reader", showReader);
    if (showDetails) {
        const root = ensureDetailsRoot();
        if (root)
            clearZone(ZONES.detailsRoot);
    }
    if (showReader)
        clearZone(ZONES.reader);
}
export function buildUrl(view, params = {}) {
    if (view === "details" && params.mangaId) {
        return `/obra/${encodeURIComponent(params.mangaId)}`;
    }
    if (view === "reader" && params.mangaId) {
        const n = Number(params.chapterNum) || 1;
        const base = `/obra/${encodeURIComponent(params.mangaId)}/${encodeURIComponent(String(n))}`;
        return params.chapterId ? `${base}?ch=${encodeURIComponent(params.chapterId)}` : base;
    }
    return "index.html";
}
export function navigate(view, params = {}, replace = false) {
    const url = buildUrl(view, params);
    if (replace) {
        history.replaceState({ view, ...params }, "", url);
    }
    else {
        location.href = url;
    }
}
/** Compat — rotas legadas multi-page */
export function parseManhwaRoute(searchParams) {
    const v = validateMangaId((searchParams.get("id") || "").trim());
    if (!v.ok)
        return { ok: false, error: v.error };
    return { ok: true, mangaId: v.mangaId };
}
export function parseLeitorRoute(searchParams) {
    const obra = obraFromPath();
    const mangaId = (searchParams.get("id") || searchParams.get("m") || obra?.mangaId || "").trim();
    const capRaw = searchParams.get("n") || searchParams.get("cap") || obra?.cap || "";
    const chapterId = searchParams.get("ch") || searchParams.get("chapterId") || null;
    const idCheck = validateMangaId(mangaId);
    if (!idCheck.ok)
        return { ok: false, error: idCheck.error };
    if (!capRaw)
        return { ok: false, error: "Capítulo não especificado." };
    const capNum = Number(capRaw);
    if (!Number.isFinite(capNum) || capNum <= 0) {
        return { ok: false, error: "Número de capítulo inválido." };
    }
    return {
        ok: true,
        mangaId: idCheck.mangaId,
        cap: capNum,
        chapterId: chapterId?.trim() || null
    };
}
export function linkManhwa(mangaId) {
    return buildUrl("details", { mangaId });
}
export function linkLeitor(mangaId, numeroCap, chapterId = null) {
    return buildUrl("reader", {
        mangaId,
        chapterNum: Number(numeroCap),
        chapterId: chapterId || undefined
    });
}
export function linkBiblioteca(opts = {}) {
    const params = new URLSearchParams();
    if (opts.q)
        params.set("q", opts.q);
    if (opts.genero)
        params.set("genero", opts.genero);
    if (opts.sort)
        params.set("sort", opts.sort);
    const qs = params.toString();
    return qs ? `biblioteca.html?${qs}` : "biblioteca.html";
}
export function rotaAtual() {
    const page = location.pathname.split("/").pop() || "index.html";
    return { page, params: new URLSearchParams(location.search) };
}
