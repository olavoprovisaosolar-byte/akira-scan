/**
 * Testa download de capítulo ToonLivre via Playwright (browser real).
 */
const BASE = "https://toonlivre.net";
const mangaId = process.argv[2] || "obra-69466adb";
const cap = process.argv[3] || "35";

async function main() {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36"
    });

    const url = `${BASE}/${mangaId}/${cap}`;
    console.log("Abrindo:", url);
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(3000);

    const pages = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll("img")];
        return imgs
            .map((i) => i.src || i.dataset?.src || i.getAttribute("data-src"))
            .filter((u) => u && /^https?:\/\//.test(u) && /\.(webp|jpg|jpeg|png)/i.test(u));
    });

    const html = await page.content();
    const jsonMatch = html.match(/"pages"\s*:\s*(\[[\s\S]*?\])/);
    let fromJson = [];
    if (jsonMatch) {
        try {
            fromJson = JSON.parse(jsonMatch[1].replace(/\\"/g, '"'));
        } catch { /* ignore */ }
    }

    console.log("Imagens DOM:", pages.length, pages.slice(0, 2));
    console.log("JSON pages:", fromJson.length, fromJson.slice(0, 2));
    console.log("Title:", await page.title());

    await browser.close();
}

main().catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
});
