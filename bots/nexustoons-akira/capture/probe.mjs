#!/usr/bin/env node
/**
 * Probe NexusToons — testa axios/cheerio vs Cloudflare e APIs públicas.
 * Uso: npm run bot:nexustoons:probe
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { processResponse, isEncryptedResponse } from "../shared/orion-crypto.js";
import { log } from "../shared/logger.js";

const BASE = process.env.NEXUSTOONS_BASE_URL || "https://nexustoons.com";

const CF_PATTERNS = [
    /challenge-platform/i,
    /cf-browser-verification/i,
    /Just a moment/i,
    /Checking your browser/i,
    /turnstile/i
];

async function probeHomepage() {
    const res = await axios.get(BASE, {
        timeout: 30000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122" },
        validateStatus: () => true
    });
    const html = String(res.data || "");
    const cloudflare = CF_PATTERNS.some((p) => p.test(html));
    const $ = cheerio.load(html);
    const title = $("title").text().trim();
    const assets = [...html.matchAll(/\/assets\/index-[\w-]+\.js/g)].map((m) => m[0]);
    return {
        status: res.status,
        cloudflare,
        title,
        length: html.length,
        assets: assets.slice(0, 3),
        server: res.headers["server"] || null,
        recommendation: cloudflare ? "playwright" : "axios"
    };
}

async function probeApi() {
    const res = await axios.get(`${BASE}/api/mangas?page=1&limit=1`, {
        timeout: 30000,
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        validateStatus: () => true
    });
    const raw = res.data;
    const decoded = processResponse(raw);
    const encrypted = isEncryptedResponse(raw);
    const items = decoded?.data || [];
    return {
        status: res.status,
        encrypted,
        count: items.length,
        sample: items[0] ? { id: items[0].id, slug: items[0].slug, title: items[0].title } : null
    };
}

async function probeChapterAuth(slug = "reencarnacao-do-deus-demonio") {
    const res = await axios.get(`${BASE}/api/manga/${slug}`, {
        timeout: 30000,
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        validateStatus: () => true
    });
    const detail = processResponse(res.data);
    const ch = detail?.chapters?.[0];
    if (!ch) return { skipped: true, reason: "sem capitulos" };
    const read = await axios.get(`${BASE}/api/read/${ch.id}`, {
        timeout: 15000,
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        validateStatus: () => true
    });
    return {
        chapterId: ch.id,
        number: ch.number,
        readStatus: read.status,
        readError: read.data?.error || null,
        needsPlaywright: read.status === 403
    };
}

async function main() {
    log.info("=== Probe NexusToons ===");

    const home = await probeHomepage();
    log.info("Homepage", home);

    const api = await probeApi();
    log.info("API /api/mangas", api);

    const auth = await probeChapterAuth();
    log.info("Leitura de capítulo (axios direto)", auth);

    const report = {
        at: new Date().toISOString(),
        homepage: home,
        api,
        chapterAuth: auth,
        techChoice: {
            catalog: home.cloudflare ? "playwright" : "axios+cheerio",
            chapters: auth.needsPlaywright ? "playwright (Turnstile/reading-session)" : "axios",
            crypto: "OrionCrypto (shared/orion-crypto.js, port de sync/python/orion_crypto.py)"
        }
    };

    console.log("\n--- Relatório ---");
    console.log(JSON.stringify(report, null, 2));

    if (auth.needsPlaywright) {
        console.log("\n→ Capítulos exigem Playwright (Turnstile). Catálogo funciona com axios.");
        console.log("  npx playwright install chromium");
    }

    process.exit(home.cloudflare && !api.count ? 1 : 0);
}

main().catch((e) => {
    log.error("Probe falhou", { err: e.message });
    process.exit(1);
});
