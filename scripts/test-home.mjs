import { chromium } from "playwright";

const BASE = process.env.TEST_BASE || "http://localhost:5501/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on("pageerror", (e) => errors.push(`PAGE:${e.message}`));
page.on("console", (m) => {
    if (m.type() === "error") errors.push(`CON:${m.text()}`);
});

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => {
    errors.push(`GOTO:${e.message}`);
});

await page.waitForSelector(".hero-hud", { timeout: 15000 }).catch(() => {
    errors.push("HERO:timeout");
});

await page.waitForTimeout(3500);

const result = await page.evaluate(() => {
    const hud = document.querySelector(".hero-hud");
    const stats = [...document.querySelectorAll(".hero-hud-stat-value")].map((el) => ({
        key: el.closest("[data-stat]")?.dataset.stat,
        text: el.textContent,
        value: el.dataset.value
    }));
    const topManga = document.querySelector('[data-stat="topManga"] .hero-hud-stat-text')?.textContent;
    const heroHidden = document.getElementById("hero-section")?.hidden;
    const carousel = document.getElementById("hero-carousel");
    const cards = document.querySelectorAll(".manga-card").length;
    const msgs = [...document.querySelectorAll(".msg-vazia")].map((el) => el.textContent.trim()).filter(Boolean);
    const actions = [...document.querySelectorAll(".hero-hud-actions a")].map((a) => a.getAttribute("href"));

    return {
        hasHud: Boolean(hud),
        hasCarousel: Boolean(carousel),
        heroHidden,
        stats,
        topManga,
        cards,
        msgs,
        actions,
        globe: Boolean(document.querySelector("#hero-hud-globe, .hero-hud-globe-fallback"))
    };
});

// Test details view hides hero
await page.goto(`${BASE}index.html?view=details&id=obra-0f20295f`, {
    waitUntil: "domcontentloaded",
    timeout: 45000
}).catch((e) => errors.push(`DETAILS_GOTO:${e.message}`));

await page.waitForTimeout(3000);

const details = await page.evaluate(() => ({
    heroHidden: document.getElementById("hero-section")?.hidden,
    categoriesHidden: document.getElementById("categories-section")?.hidden,
    detailsVisible: !document.getElementById("details-section")?.hidden,
    hasDetails: Boolean(document.querySelector(".manga-details"))
}));

const ok =
    result.hasHud &&
    !result.hasCarousel &&
    result.globe &&
    result.stats.some((s) => s.key === "mangas" && s.text !== "0") &&
    result.actions.length === 2 &&
    details.heroHidden &&
    details.categoriesHidden &&
    details.detailsVisible &&
    errors.length === 0;

console.log(JSON.stringify({ ok, result, details, errors }, null, 2));
await browser.close();
process.exit(ok ? 0 : 1);
