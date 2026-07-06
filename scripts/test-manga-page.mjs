import { chromium } from "playwright";

const mangaId = process.argv[2] || "obra-69466adb";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
const failed = [];
page.on("pageerror", (e) => errors.push(`PAGE:${e.message}`));
page.on("console", (m) => {
    if (m.type() === "error") errors.push(`CON:${m.text()}`);
});
page.on("requestfailed", (r) => failed.push(r.url()));
page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
});

await page.goto(`http://localhost:5501/manhwa.html?id=${mangaId}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000
});
await page.waitForTimeout(6000);

const html = await page.locator("#manga-conteudo").innerHTML().catch(() => "");
const chapterCards = await page.locator(".chapter-card").count();

console.log(JSON.stringify({
    title: await page.title(),
    chapterCards,
    htmlLen: html.length,
    htmlSnippet: html.slice(0, 300),
    failed: failed.slice(0, 15),
    errors
}, null, 2));
await browser.close();
