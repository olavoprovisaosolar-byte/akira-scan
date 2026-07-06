/**
 * Teste rápido — Playwright captura páginas de capítulo ToonLivre.
 */
const mangaId = process.argv[2] || "obra-69466adb";
const chapterId = process.argv[3] || "cap-d501f6c4-35";
const numero = process.argv[4] || "35";
const BASE = "https://toonlivre.net";

async function main() {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        locale: "pt-BR"
    });
    const page = await context.newPage();

    let apiPages = null;
    page.on("response", async (res) => {
        const u = res.url();
        if (!u.includes("/api/mangas/") || !u.includes("/chapters/")) return;
        try {
            const json = await res.json();
            if (json.pages?.length) apiPages = json.pages;
        } catch { /* ignore */ }
    });

    console.log("Warmup home...");
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    const chapterUrl = `${BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(numero)}`;
    console.log("Chapter:", chapterUrl);
    await page.goto(chapterUrl, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(4000);

    console.log("Final URL:", page.url());
    console.log("API pages:", apiPages?.length ?? 0, apiPages?.slice(0, 2));

    const domImgs = await page.evaluate(() =>
        [...document.querySelectorAll("img")]
            .map((i) => i.src || i.getAttribute("data-src"))
            .filter((u) => u && /^https?:\/\//.test(u))
    );
    console.log("DOM imgs:", domImgs.length);

    const html = await page.content();
    const embedded = html.match(/"pages"\s*:\s*(\[[\s\S]*?\])/);
    if (embedded) console.log("Embedded JSON found, len:", embedded[1].length);

    await browser.close();
}

main().catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
});
