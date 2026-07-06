import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGE:${e.message}`));
page.on("console", (m) => {
    if (m.type() === "error") errors.push(`CON:${m.text()}`);
});

await page.goto("http://localhost:5501/", { waitUntil: "networkidle", timeout: 45000 }).catch((e) => {
    errors.push(`GOTO:${e.message}`);
});
await page.waitForTimeout(4000);

const cards = await page.locator(".manga-card").count();
const msgs = await page.locator(".msg-vazia").allTextContents();
const loading = await page.locator(".akira-state-loading").count();
const heroSlides = await page.locator(".hero-slide").count();
const catalogFetch = await page.evaluate(async () => {
    try {
        const r = await fetch("/data/catalogo-index.json");
        const j = await r.json();
        return { ok: r.ok, total: j.total };
    } catch (e) {
        return { ok: false, err: e.message };
    }
});

console.log(JSON.stringify({ cards, msgs, loading, heroSlides, catalogFetch, errors }, null, 2));
await browser.close();
