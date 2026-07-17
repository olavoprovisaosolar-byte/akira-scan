/**
 * Capture ToonLivre — stream (sem gravar caps em disco).
 * Usa API toonlivre.net + Playwright só se a API não devolver pages[].
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizeChapter } from "../shared/schema.js";
import { log } from "../shared/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
const CLIENT = path.join(ROOT, "netlify", "functions", "toonlivre-client.mjs");

const TOONLIVRE_BASE = process.env.TOONLIVRE_BASE_URL || "https://toonlivre.net";
const USE_PW = process.env.TOONLIVRE_USE_PLAYWRIGHT !== "0";

// Prefer browsers do projeto (como backup-toonlivre-complete)
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(ROOT, ".playwright-browsers");
}

async function loadClient() {
    return import(pathToFileURL(CLIENT).href);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function mapChapter(c) {
    return {
        id: c.id,
        number: Number(c.number ?? c.numero ?? c.chapterNumber) || 0,
        title: c.title || c.titulo || null
    };
}

function mapManga(data) {
    const chapters = (data.chapters || data.capitulos || [])
        .map(mapChapter)
        .filter((c) => c.number > 0)
        .sort((a, b) => a.number - b.number);
    return {
        id: String(data.id || data.uploadSlug || data.slug),
        slug: data.slug || data.uploadSlug || data.id,
        title: data.title || data.titulo,
        coverImage: data.coverUrl || data.cover || data.capa,
        description: data.description || data.sinopse,
        author: data.author || data.autor,
        status: data.status,
        chapters
    };
}

/** Playwright lazy — só se API falhar. */
class PwHelper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.warmed = false;
    }

    async init() {
        if (this.page) return;
        const { chromium } = await import("playwright");
        this.browser = await chromium.launch({ headless: true });
        const ctx = await this.browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport: { width: 1280, height: 900 }
        });
        this.page = await ctx.newPage();
    }

    async fetchPages(mangaId, capId, numero) {
        await this.init();
        let apiPages = null;
        const handler = async (res) => {
            const u = res.url();
            if (!u.includes("/api/mangas/") || !u.includes("/chapters/")) return;
            try {
                const json = await res.json();
                if (json.pages?.length) apiPages = json.pages;
            } catch { /* ignore */ }
        };
        this.page.on("response", handler);
        try {
            await this.page.goto(
                `${TOONLIVRE_BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(String(numero))}`,
                { waitUntil: "domcontentloaded", timeout: 60000 }
            );
            await this.page.waitForTimeout(Number(process.env.BACKUP_PW_SETTLE_MS || 800));
        } finally {
            this.page.off("response", handler);
        }
        if (apiPages?.length) {
            return apiPages.map((p) => (typeof p === "string" ? p : p?.url)).filter(Boolean);
        }
        const domUrls = await this.page.evaluate(() =>
            [...document.querySelectorAll("img, picture source")]
                .map((el) => el.src || el.getAttribute("data-src") || el.getAttribute("srcset")?.split(" ")[0])
                .filter((u) => u && /^https?:\/\//.test(u) && /\.(webp|jpg|jpeg|png)/i.test(u))
        );
        return [...new Set(domUrls)].filter((u) => !/logo|avatar|banner|404|widget/i.test(u));
    }

    async close() {
        if (this.browser) await this.browser.close();
        this.browser = null;
        this.page = null;
    }
}

export function createAdapter() {
    const pw = new PwHelper();
    let clientPromise = null;

    async function client() {
        if (!clientPromise) clientPromise = loadClient();
        return clientPromise;
    }

    return {
        name: "toonlivre",

        async listMangas({ page = 1, limit = 48 } = {}) {
            const c = await client();
            const data = await c.pesquisarMangas({ page, limit, sortBy: "popular" });
            const list = data.mangas || data.data || data.results || [];
            return list.map(mapManga);
        },

        async getManga(slugOrId) {
            const c = await client();
            let data;
            try {
                data = await c.obterMangaPorSlug(slugOrId);
            } catch {
                data = await c.fetchToonLivre?.(`/api/mangas/${encodeURIComponent(slugOrId)}`)
                    || await c.obterMangaPorSlug(slugOrId);
            }
            return mapManga(data);
        },

        async listChapters(slugOrId) {
            const manga = await this.getManga(slugOrId);
            return manga.chapters || [];
        },

        /**
         * Captura URLs das páginas — NÃO grava em data/toonlivre-backup.
         */
        async captureChapter(slugOrId, chapterRef, akiraIds) {
            const c = await client();
            const mangaId = String(akiraIds?.mangaId || slugOrId);
            const capId = String(akiraIds?.capId || chapterRef.id);
            const numero = chapterRef.number;
            const chapterId = String(chapterRef.id);

            let pageUrls = [];
            try {
                const pages = await c.obterPaginasCapitulo(mangaId, chapterId, numero);
                pageUrls = (pages || [])
                    .map((p) => (typeof p === "string" ? p : p?.url || p?.src))
                    .filter(Boolean);
            } catch (e) {
                log.warn(`ToonLivre API pages falhou — tentando Playwright`, { mangaId, capId, err: e.message });
            }

            if ((!pageUrls.length) && USE_PW) {
                pageUrls = await pw.fetchPages(mangaId, chapterId, numero);
            }

            if (!pageUrls?.length) {
                throw new Error(`ToonLivre sem páginas: ${mangaId}/${capId}`);
            }

            const delay = Number(process.env.TOONLIVRE_DELAY_MS || process.env.NEXUSTOONS_DELAY_MS || 50);
            if (delay > 0) await sleep(delay);

            return normalizeChapter({
                mangaId,
                capId,
                numero,
                titulo: chapterRef.title || `Capítulo ${numero}`,
                pages: pageUrls.map((url, index) => ({ index, url })),
                source: "toonlivre",
                sourceUrl: `${TOONLIVRE_BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(String(numero))}`
            });
        },

        async close() {
            await pw.close();
        }
    };
}
