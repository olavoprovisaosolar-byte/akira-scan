/**
 * Playwright — navegador headless para SPAs (fallback após axios+cheerio).
 * Ative com SCRAPER_ENGINE=playwright (requer `npx playwright install chromium`).
 */
import { logger } from "../../core/logger.js";
import { CHROME_UA } from "../../infrastructure/http/secure-client.js";

let browserPromise: Promise<unknown> | null = null;

async function getBrowser() {
    if (!browserPromise) {
        browserPromise = (async () => {
            try {
                const { chromium } = await import("playwright");
                return chromium.launch({
                    headless: true,
                    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
                });
            } catch (e) {
                logger.error("Playwright", "Instale: npx playwright install chromium", { err: (e as Error).message });
                throw e;
            }
        })();
    }
    return browserPromise as Promise<{
        newPage: () => Promise<{
            goto: (url: string, opts?: object) => Promise<void>;
            content: () => Promise<string>;
            close: () => Promise<void>;
            waitForTimeout: (ms: number) => Promise<void>;
            evaluate: (fn: string | ((...args: unknown[]) => unknown)) => Promise<unknown>;
        }>;
    }>;
}

export async function fetchHtmlWithBrowser(url: string, waitMs = 2500): Promise<string> {
    try {
        const browser = await getBrowser();
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
        await page.waitForTimeout(waitMs);
        const html = await page.content();
        await page.close();
        logger.debug("Playwright", `HTML ${html.length} bytes`, { url });
        return html;
    } catch (err) {
        logger.warn("Playwright", (err as Error).message, { url });
        throw err;
    }
}

/** Scroll infinito — dispara lazy-load de listas longas de capítulos. */
export async function fetchHtmlWithScroll(
    url: string,
    opts: { waitMs?: number; scrollSteps?: number } = {}
): Promise<string> {
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
    } catch (err) {
        logger.warn("Playwright", `Scroll falhou: ${(err as Error).message}`, { url });
        return fetchHtmlWithBrowser(url, waitMs);
    }
}

export function usePlaywright(): boolean {
    return process.env.SCRAPER_ENGINE === "playwright";
}

export async function closeBrowser(): Promise<void> {
    if (browserPromise) {
        const b = await browserPromise as { close: () => Promise<void> };
        await b.close?.();
        browserPromise = null;
    }
}
