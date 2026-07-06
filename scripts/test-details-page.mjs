import { chromium } from "playwright";

const mangaId = "obra-69466adb";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`http://localhost:5501/index.html?view=details&id=${mangaId}`, {
    waitUntil: "load",
    timeout: 60000
});
await page.waitForTimeout(12000);

const diag = await page.evaluate(() => ({
    href: location.href,
    view: new URLSearchParams(location.search).get("view"),
    id: new URLSearchParams(location.search).get("id"),
    hasRoot: !!document.getElementById("details-root"),
    rootHtml: document.getElementById("details-root")?.innerHTML?.length || 0,
    cards: document.querySelectorAll(".chapter-card").length,
    title: document.title,
    detailsHidden: document.getElementById("details-section")?.hidden,
    heroHidden: document.getElementById("hero-section")?.hidden
}));

console.log(JSON.stringify(diag, null, 2));
await browser.close();
