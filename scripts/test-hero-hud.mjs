/**
 * Teste rápido do Hero HUD — sem Playwright.
 */
const BASE = process.env.TEST_BASE || "http://localhost:5501";

async function fetchText(url) {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status, text: await res.text() };
}

const errors = [];

function assert(cond, msg) {
    if (!cond) errors.push(msg);
}

const index = await fetchText(`${BASE}/index.html`);
assert(index.ok, `index.html status ${index.status}`);
assert(!index.text.includes('id="hero-carousel"'), "carrossel ainda no HTML");
assert(index.text.includes('id="hero-planet-slot"'), "slot do hero ausente");

const files = [
    "/js/ui/hero-planet.js",
    "/js/services/live-stats.js",
    "/js/dist/client/components/hero-planet-three.js",
    "/css/akira.css",
    "/data/catalogo-index.json",
    "/data/cloud/chapters-index.json"
];

for (const f of files) {
    const r = await fetch(`${BASE}${f}`, { method: "HEAD" });
    assert(r.ok, `${f} -> ${r.status}`);
}

const heroJs = await fetchText(`${BASE}/js/ui/hero-planet.js`);
assert(heroJs.text.includes("hero-hud"), "hero-planet.js sem HUD");
assert(heroJs.text.includes("destroyHeroPlanet"), "destroyHeroPlanet ausente");

const homeJs = await fetchText(`${BASE}/js/pages/home-page.js`);
assert(homeJs.text.includes('showView("details")'), "showView details ausente");
assert(!homeJs.text.includes("initCarousel"), "initCarousel ainda referenciado");

const statsJs = await fetchText(`${BASE}/js/services/live-stats.js`);
assert(statsJs.text.includes("registrarVisitaSessao"), "visitas sem sessão");
assert(statsJs.text.includes("obterTotalCapitulosCloud"), "cloud index ausente");

const cloud = await fetch(`${BASE}/data/cloud/chapters-index.json`).then((r) => r.json());
assert(cloud.total >= 5000, `cloud index baixo: ${cloud.total}`);

const catalog = await fetch(`${BASE}/data/catalogo-index.json`).then((r) => r.json());
assert((catalog.mangas?.length || catalog.total) >= 400, "catálogo pequeno");

console.log(JSON.stringify({
    ok: errors.length === 0,
    errors,
    cloudTotal: cloud.total,
    catalogMangas: catalog.mangas?.length || catalog.total
}, null, 2));

process.exit(errors.length === 0 ? 0 : 1);
