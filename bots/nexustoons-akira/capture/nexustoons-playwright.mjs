/**
 * Fallback Playwright — contorna Cloudflare Turnstile para reading-session e páginas.
 * Usado apenas pelo módulo capture (sem lógica de upload).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processResponse, isEncryptedResponse } from "../shared/orion-crypto.js";
import { log } from "../shared/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
const BASE = process.env.NEXUSTOONS_BASE_URL || "https://nexustoons.com";
const SETTLE_MS = Number(process.env.NEXUSTOONS_PW_SETTLE_MS
    || (process.env.NEXUSTOONS_BULK === "1" ? 1500 : 2500));
const GOTO_WAIT = process.env.NEXUSTOONS_PW_GOTO_WAIT || "domcontentloaded";
const DEFAULT_NEXUS_DELAY = process.env.NEXUSTOONS_BULK === "1" ? 300 : 800;
const NEXUSTOONS_DELAY_MS = Math.max(0, Number(process.env.NEXUSTOONS_DELAY_MS || DEFAULT_NEXUS_DELAY));
let lastPwRequestAt = 0;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function throttlePwRequest() {
    if (NEXUSTOONS_DELAY_MS <= 0) return;
    const elapsed = Date.now() - lastPwRequestAt;
    if (elapsed < NEXUSTOONS_DELAY_MS) {
        await sleep(NEXUSTOONS_DELAY_MS - elapsed);
    }
    lastPwRequestAt = Date.now();
}

function extractImageUrls(html) {
    return [...html.matchAll(/https?:\/\/[^"'\\\s]+\.(?:webp|jpg|jpeg|png|avif)(?:\?[^"'\\\s]*)?/gi)]
        .map((m) => m[0])
        .filter((u) => !/logo|avatar|banner|404|widget|turnstile|og-image|\/site\//i.test(u));
}

export function createChapterFetcher() {
    let browser = null;
    let context = null;
    let page = null;
    let warmed = false;
    let warmedSlug = null;

    const blockListingResources = (route) => {
        const type = route.request().resourceType();
        const url = route.request().url();
        if (url.includes("/api/")) return route.continue();
        if (type === "image") return route.abort();
        return route.continue();
    };

    const blockHeavyResources = (route) => {
        const type = route.request().resourceType();
        const url = route.request().url();
        if (url.includes("/api/")) return route.continue();
        if (["image", "font", "stylesheet", "media", "websocket", "manifest"].includes(type)) {
            return route.abort();
        }
        if (/google-analytics|googletagmanager|facebook|hotjar|doubleclick|cloudflareinsights|adservice|ads\./i.test(url)) {
            return route.abort();
        }
        return route.continue();
    };

    async function init() {
        if (browser) return;
        if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
            process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(ROOT, ".playwright-browsers");
        }
        const { chromium } = await import("playwright");
        const chromiumArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
        if (process.env.NEXUSTOONS_PW_LITE === "1") {
            chromiumArgs.push("--disable-gpu", "--disable-software-rasterizer", "--disable-extensions");
            if (process.platform !== "win32") {
                chromiumArgs.push("--single-process");
            }
        }
        const launchOpts = {
            headless: process.env.NEXUSTOONS_PW_HEADLESS !== "0",
            args: chromiumArgs
        };
        try {
            browser = await chromium.launch(launchOpts);
        } catch {
            log.warn("Chromium bundled ausente — tentando Chrome do sistema");
            browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
        }
        context = await browser.newContext({
            userAgent: process.env.NEXUSTOONS_USER_AGENT ||
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale: "pt-BR",
            viewport: { width: 1280, height: 900 }
        });
        page = await context.newPage();
    }

    async function warmup(slug) {
        await init();
        if (warmed && warmedSlug === slug) return;
        const mangaUrl = slug
            ? `${BASE}/manga/${encodeURIComponent(slug)}`
            : `${BASE}/`;
        await context.route("**/*", blockListingResources);
        try {
            await page.goto(mangaUrl, { waitUntil: GOTO_WAIT, timeout: 90000 });
            await page.waitForTimeout(SETTLE_MS);
        } finally {
            await context.unroute("**/*", blockListingResources);
        }
        warmed = true;
        warmedSlug = slug || null;
    }

    async function fetchViaReadApi(slug, chapterId, chapterNumber) {
        await throttlePwRequest();
        const res = await page.context().request.get(`${BASE}/api/read/${chapterId}`, {
            headers: {
                Accept: "application/json",
                Referer: `${BASE}/manga/${encodeURIComponent(slug)}/${encodeURIComponent(String(chapterNumber))}`
            }
        });
        if (!res.ok()) {
            throw new Error(`api/read/${chapterId} → HTTP ${res.status()}`);
        }
        const decoded = processResponse(await res.json());
        const pages = decoded?.pages || decoded?.images || (Array.isArray(decoded) ? decoded : null);
        if (!pages?.length) {
            throw new Error(`api/read/${chapterId} sem páginas`);
        }
        return normalizePageList(pages);
    }

    /**
     * @returns {Promise<string[]>}
     */
    async function fetchChapterPages(slug, chapterId, chapterNumber) {
        await warmup(slug);

        try {
            const fromApi = await fetchViaReadApi(slug, chapterId, chapterNumber);
            if (fromApi.length) return fromApi;
        } catch (e) {
            log.warn("api/read via Playwright falhou — tentando navegação", { slug, chapterNumber, err: e.message });
        }

        let apiPages = null;
        let encryptedPayload = null;

        const handler = async (res) => {
            const u = res.url();
            if (!u.includes("/api/")) return;
            const interesting =
                u.includes("/chapter/") ||
                u.includes("/read/") ||
                u.includes("/pages") ||
                u.includes("/reading-session");
            if (!interesting) return;
            try {
                const json = await res.json();
                const decoded = processResponse(json);
                if (Array.isArray(decoded)) {
                    apiPages = decoded;
                } else if (decoded?.pages?.length) {
                    apiPages = decoded.pages;
                } else if (decoded?.images?.length) {
                    apiPages = decoded.images;
                } else if (isEncryptedResponse(json)) {
                    encryptedPayload = decoded;
                }
            } catch { /* ignore */ }
        };

        page.on("response", handler);

        const useHeavyBlock = process.env.NEXUSTOONS_PW_BLOCK_HEAVY !== "0";
        if (useHeavyBlock) {
            await context.route("**/*", blockHeavyResources);
        }

        const candidates = [
            `${BASE}/manga/${encodeURIComponent(slug)}/${encodeURIComponent(String(chapterNumber))}`,
            `${BASE}/manga/${encodeURIComponent(slug)}/capitulo-${encodeURIComponent(String(chapterNumber))}`,
            `${BASE}/ler/${encodeURIComponent(slug)}/${encodeURIComponent(String(chapterNumber))}`
        ];

        for (const url of candidates) {
            try {
                const resp = await page.goto(url, { waitUntil: GOTO_WAIT, timeout: 60000 });
                if (resp && resp.status() >= 400) continue;
                await page.waitForTimeout(SETTLE_MS);
                if (apiPages?.length) break;
            } catch (e) {
                log.debug("goto parcial", { url, err: e.message });
            }
        }

        page.off("response", handler);

        if (useHeavyBlock) {
            await context.unroute("**/*", blockHeavyResources);
        }

        if (apiPages?.length) {
            return normalizePageList(apiPages);
        }

        if (encryptedPayload?.pages?.length) {
            return normalizePageList(encryptedPayload.pages);
        }

        const html = await page.content();
        const fromHtml = extractImageUrls(html);
        if (fromHtml.length >= 1) return [...new Set(fromHtml)];

        const domUrls = await page.evaluate(() =>
            [...document.querySelectorAll("img, picture source, [data-src]")]
                .map((el) =>
                    el.src ||
                    el.getAttribute("data-src") ||
                    el.getAttribute("srcset")?.split(" ")[0]
                )
                .filter((u) => u && /^https?:\/\//.test(u) && /\.(webp|jpg|jpeg|png|avif)/i.test(u))
        );
        const unique = [...new Set(domUrls)].filter((u) => !/logo|avatar|banner|404|widget|og-image|\/site\//i.test(u));
        if (unique.length >= 1) return unique;

        throw new Error(`Nenhuma página encontrada (slug=${slug}, cap=${chapterNumber}, id=${chapterId})`);
    }

    function normalizePageList(pages) {
        return pages
            .map((p) => (typeof p === "string" ? p : p?.imageUrl || p?.url || p?.src))
            .filter(Boolean)
            .sort((a, b) => {
                const ia = pages.findIndex((p) => (typeof p === "string" ? p : p?.imageUrl || p?.url) === a);
                const ib = pages.findIndex((p) => (typeof p === "string" ? p : p?.imageUrl || p?.url) === b);
                return ia - ib;
            });
    }

    async function close() {
        if (browser) await browser.close();
        browser = null;
        context = null;
        page = null;
        warmed = false;
        warmedSlug = null;
    }

    return { fetchChapterPages, close };
}

/** Adapter capture completo via Playwright (modo alternativo). */
export function createAdapter() {
    const fetcher = createChapterFetcher();
    const axiosAdapterPromise = import("./nexustoons.js");

    return {
        name: "playwright",
        async listMangas(opts) {
            const ax = await axiosAdapterPromise;
            return ax.createAdapter().listMangas(opts);
        },
        async getManga(slug) {
            const ax = await axiosAdapterPromise;
            return ax.createAdapter().getManga(slug);
        },
        async listChapters(slug) {
            const ax = await axiosAdapterPromise;
            return ax.createAdapter().listChapters(slug);
        },
        async captureChapter(slug, chapterRef, akiraIds) {
            const ax = await axiosAdapterPromise;
            const inner = ax.createAdapter();
            inner.captureChapter = async (s, ch, ids) => {
                const pageUrls = await fetcher.fetchChapterPages(s, ch.id, ch.number);
                const { normalizeChapter } = await import("../shared/schema.js");
                return normalizeChapter({
                    mangaId: ids.mangaId,
                    capId: ids.capId,
                    numero: Number(ch.number),
                    titulo: ch.title || `Capítulo ${ch.number}`,
                    pages: pageUrls.map((url, index) => ({ index, url })),
                    source: "nexustoons-playwright"
                });
            };
            return inner.captureChapter(slug, chapterRef, akiraIds);
        },
        close: () => fetcher.close()
    };
}
