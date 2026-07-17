/**
 * Capture NexusToons — axios + OrionCrypto (catálogo e metadados).
 * Páginas de capítulo delegadas ao Playwright (Turnstile / reading-session).
 */
import axios from "axios";
import { loadConfig } from "../shared/config.js";
import { processResponse } from "../shared/orion-crypto.js";
import { normalizeChapter } from "../shared/schema.js";
import { log } from "../shared/logger.js";

const { nexustoonsBaseUrl: BASE } = loadConfig();

const HEADERS = {
    "User-Agent": process.env.NEXUSTOONS_USER_AGENT ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    Accept: "application/json"
};

const DEFAULT_NEXUS_DELAY = process.env.NEXUSTOONS_BULK === "1" ? 300 : 800;
const NEXUSTOONS_DELAY_MS = Math.max(0, Number(process.env.NEXUSTOONS_DELAY_MS || DEFAULT_NEXUS_DELAY));
let lastRequestAt = 0;

const client = axios.create({
    baseURL: BASE,
    timeout: Number(process.env.NEXUSTOONS_TIMEOUT_MS || 45000),
    headers: HEADERS,
    validateStatus: (s) => s < 500
});

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function throttleNexusRequest() {
    if (NEXUSTOONS_DELAY_MS <= 0) return;
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < NEXUSTOONS_DELAY_MS) {
        await sleep(NEXUSTOONS_DELAY_MS - elapsed);
    }
    lastRequestAt = Date.now();
}

async function apiGet(path) {
    await throttleNexusRequest();
    const res = await client.get(path, { headers: { ...HEADERS, Accept: "application/json" } });
    if (res.status >= 400) {
        throw new Error(`NexusToons ${path} → HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
    }
    return processResponse(res.data);
}

function mapMangaSummary(m) {
    return {
        id: String(m.id),
        slug: m.slug,
        title: m.title,
        coverImage: m.coverImage || m.cover,
        description: m.description,
        author: m.author,
        status: m.status,
        chapters: (m.chapters || []).map((c) => ({
            id: c.id,
            number: c.number ?? c.chapterNumber,
            title: c.title
        }))
    };
}

function mapMangaDetail(data) {
    return {
        id: String(data.id),
        slug: data.slug,
        title: data.title,
        coverImage: data.coverImage,
        description: data.description,
        author: data.author || data.artist,
        status: data.status,
        chapters: (data.chapters || []).map((c) => ({
            id: c.id,
            number: c.number,
            title: c.title,
            accessLevel: c.accessLevel,
            coinCost: c.coinCost
        }))
    };
}

/** @type {import('./adapter.js').CaptureAdapter} */
export function createAdapter() {
    /** @type {import('./nexustoons-playwright.mjs').PlaywrightChapterFetcher|null} */
    let pwFetcher = null;

    async function getPwFetcher() {
        if (pwFetcher) return pwFetcher;
        const usePw = process.env.NEXUSTOONS_USE_PLAYWRIGHT !== "0";
        if (!usePw) return null;
        const mod = await import("./nexustoons-playwright.mjs");
        pwFetcher = mod.createChapterFetcher();
        return pwFetcher;
    }

    return {
        name: "nexustoons",

        async listMangas({ page = 1, limit = 50 } = {}) {
            const data = await apiGet(`/api/mangas?page=${page}&limit=${limit}`);
            const items = data?.data || data?.mangas || [];
            return items.map(mapMangaSummary);
        },

        async getManga(slug) {
            const data = await apiGet(`/api/manga/${encodeURIComponent(slug)}`);
            return mapMangaDetail(data);
        },

        async listChapters(slug) {
            const manga = await this.getManga(slug);
            return manga.chapters || [];
        },

        async captureChapter(slug, chapterRef, akiraIds) {
            const numero = Number(chapterRef.number);
            log.tag("NEXUSTOONS", `Baixando imagens do Capítulo ${chapterRef.number}...`, { slug });
            const pw = await getPwFetcher();
            let pageUrls = [];

            if (pw) {
                try {
                    pageUrls = await pw.fetchChapterPages(slug, chapterRef.id, chapterRef.number);
                } catch (e) {
                    log.warn("Playwright falhou ao capturar páginas", { slug, numero, err: e.message });
                }
            }

            if (!pageUrls.length) {
                throw new Error(
                    `Sem páginas para ${slug} cap.${chapterRef.number}. ` +
                    "Ative NEXUSTOONS_USE_PLAYWRIGHT=1 e instale: npx playwright install chromium"
                );
            }

            log.tag("NEXUSTOONS", `Capítulo ${chapterRef.number}: ${pageUrls.length} páginas capturadas`, { slug });

            const chapter = normalizeChapter({
                mangaId: akiraIds.mangaId,
                capId: akiraIds.capId,
                numero,
                titulo: chapterRef.title || `Capítulo ${chapterRef.number}`,
                pages: pageUrls.map((url, index) => ({ index, url })),
                source: "nexustoons"
            });

            return chapter;
        },

        async close() {
            if (pwFetcher) {
                await pwFetcher.close();
                pwFetcher = null;
            }
        }
    };
}
