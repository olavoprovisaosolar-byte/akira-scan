/**
 * Playwright — navegador headless para SPAs (fallback após axios+cheerio).
 * Ative com SCRAPER_ENGINE=playwright (requer `npx playwright install chromium`).
 */
import { logger } from "../../core/logger.js";
let browserPromise = null;
async function getBrowser() {
    if (!browserPromise) {
        browserPromise = (async () => {
            try {
                const { chromium } = await import("playwright");
                return chromium.launch({
                    headless: true,
                    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
                });
            }
            catch (e) {
                logger.error("Playwright", "Instale: npx playwright install chromium", { err: e.message });
                throw e;
            }
        })();
    }
    return browserPromise;
}
export async function fetchHtmlWithBrowser(url, waitMs = 2500) {
    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
        await page.waitForTimeout(waitMs);
        const html = await page.content();
        await page.close();
        logger.debug("Playwright", `HTML ${html.length} bytes`, { url });
        return html;
    }
    catch (err) {
        logger.warn("Playwright", err.message, { url });
        throw err;
    }
}
/** Scroll infinito — dispara lazy-load de listas longas de capítulos. */
export async function fetchHtmlWithScroll(url, opts = {}) {
    const waitMs = opts.waitMs ?? 2000;
    const scrollSteps = opts.scrollSteps ?? 10;
    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForTimeout(800);
        for (let i = 0; i < scrollSteps; i++) {
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
            await page.waitForTimeout(waitMs / scrollSteps);
        }
        const html = await page.content();
        await page.close();
        logger.debug("Playwright", `Scroll HTML ${html.length} bytes`, { url, scrollSteps });
        return html;
    }
    catch (err) {
        logger.warn("Playwright", `Scroll falhou: ${err.message}`, { url });
        return fetchHtmlWithBrowser(url, waitMs);
    }
}
export function usePlaywright() {
    return process.env.SCRAPER_ENGINE === "playwright";
}
export async function closeBrowser() {
    if (browserPromise) {
        const b = await browserPromise;
        await b.close?.();
        browserPromise = null;
    }
}
