/**
 * Playwright — intercepta respostas de rede no capítulo ToonLivre.
 */
const BASE = "https://toonlivre.net";
const mangaId = process.argv[2] || "obra-69466adb";
const cap = process.argv[3] || "35";

async function main() {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const captured = [];
    page.on("response", async (res) => {
        const url = res.url();
        if (!url.includes("toonlivre") && !url.includes("cdn")) return;
        if (!url.includes("/api/") && !/\.(webp|jpg|jpeg|png)/i.test(url)) return;
        try {
            const ct = res.headers()["content-type"] || "";
            if (url.includes("/api/") || ct.includes("json")) {
                const text = await res.text().catch(() => "");
                captured.push({ url, status: res.status(), body: text.slice(0, 500) });
            } else {
                captured.push({ url, status: res.status(), type: "image" });
            }
        } catch { /* ignore */ }
    });

    const chapterUrl = `${BASE}/${mangaId}/${cap}`;
    console.log("Navigating:", chapterUrl);
    try {
        await page.goto(chapterUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(8000);
    } catch (e) {
        console.log("Goto err:", e.message);
    }

    console.log("Final URL:", page.url());
    console.log("Captured:", captured.length);
    for (const c of captured.slice(0, 15)) {
        console.log(JSON.stringify(c));
    }

    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
