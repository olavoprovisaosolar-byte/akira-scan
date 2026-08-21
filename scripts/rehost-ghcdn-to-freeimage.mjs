#!/usr/bin/env node
/**
 * Rehost github-cdn → Freeimage (iili.io), sem Nexus.
 * Baixa via /api/gh-cdn e sobe para iili permanente.
 *
 *   node scripts/rehost-ghcdn-to-freeimage.mjs
 *   node scripts/rehost-ghcdn-to-freeimage.mjs --limit=5
 *   node scripts/rehost-ghcdn-to-freeimage.mjs --concurrency=2
 *   node scripts/rehost-ghcdn-to-freeimage.mjs --wait-proxy
 *   node scripts/rehost-ghcdn-to-freeimage.mjs --manga=obra-e7e46b19
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { uploadImage } from "../bots/nexustoons-akira/hosting/freeimage.js";
import {
    capLegivelIndice,
    readJsonFile,
    writeJsonAtomic
} from "./lib/chapter-index-utils.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOUD = path.join(ROOT, "data", "cloud", "chapters-index.json");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const PROGRESS = path.join(ROOT, "data", "nexustoons", "rehost-ghcdn-progress.json");

const args = process.argv.slice(2);
const LIMIT = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0) || 0;
const CONCURRENCY = Math.max(1, Number(args.find((a) => a.startsWith("--concurrency="))?.split("=")[1]
    || process.env.REHOST_CONCURRENCY || 2));
const MANGA = args.find((a) => a.startsWith("--manga="))?.split("=")[1] || "";
const WAIT_PROXY = args.includes("--wait-proxy") || process.env.REHOST_WAIT_PROXY === "1";
const CLEAR_FAILED = args.includes("--clear-failed") || process.env.REHOST_CLEAR_FAILED === "1";
const CHECKPOINT_EVERY = Math.max(1, Number(process.env.REHOST_CHECKPOINT_EVERY || 5));
const PAGE_TIMEOUT_MS = Math.max(5000, Number(process.env.REHOST_PAGE_TIMEOUT_MS || 45000));
const UPLOAD_DELAY_MS = Math.max(0, Number(process.env.FREEIMAGE_DELAY_MS || 200));
const PAGE_RETRIES = Math.max(1, Number(process.env.REHOST_PAGE_RETRIES || 4));
const PROXY_PROBE_MS = Math.max(15_000, Number(process.env.REHOST_PROXY_PROBE_MS || 60_000));

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function loadProgress() {
    return readJsonFile(PROGRESS, { done: {}, failed: {}, startedAt: null });
}

function saveProgress(p) {
    writeJsonAtomic(PROGRESS, p);
}

function recomputePorManga(caps) {
    const porManga = {};
    for (const rec of Object.values(caps || {})) {
        const id = rec.mangaId;
        if (!id) continue;
        if (!porManga[id]) porManga[id] = { totalCaps: 0, doneCaps: 0, legibleCaps: 0, purgedCaps: 0 };
        porManga[id].totalCaps++;
        if (rec.done) porManga[id].doneCaps++;
        if (rec.localPurged) porManga[id].purgedCaps++;
        if (capLegivelIndice(rec)) porManga[id].legibleCaps++;
    }
    return porManga;
}

function saveCloud(cloud) {
    cloud.porManga = recomputePorManga(cloud.caps);
    cloud.total = Object.keys(cloud.caps || {}).length;
    cloud.atualizadoEm = new Date().toISOString();
    cloud.origem = "rehost-ghcdn-freeimage";
    const tmp = `${CLOUD}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cloud));
    fs.renameSync(tmp, CLOUD);
}

function isTransientGetError(err) {
    const msg = String(err?.message || err || "");
    return /\b(502|503|429|403|408|500|fetch failed|timeout|aborted)\b/i.test(msg);
}

async function fetchPageBuffer(url) {
    let lastErr;
    for (let attempt = 1; attempt <= PAGE_RETRIES; attempt++) {
        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "AkiraScan-Rehost/1.0", Accept: "image/*,*/*" },
                signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
                redirect: "follow"
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                throw new Error(`GET ${res.status}${body ? `: ${body.slice(0, 80)}` : ""}`);
            }
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("text/html") || ct.includes("application/json") || ct.includes("text/plain")) {
                const body = await res.text().catch(() => "");
                throw new Error(`não é imagem (${ct}): ${body.slice(0, 80)}`);
            }
            return Buffer.from(await res.arrayBuffer());
        } catch (err) {
            lastErr = err;
            if (attempt >= PAGE_RETRIES || !isTransientGetError(err)) throw err;
            const wait = Math.min(120_000, 2000 * (2 ** (attempt - 1)));
            console.warn(`  retry page ${attempt}/${PAGE_RETRIES} em ${Math.round(wait / 1000)}s — ${err.message}`);
            await sleep(wait);
        }
    }
    throw lastErr;
}

async function mapPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function run() {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
    return results;
}

async function rehostCap(rec) {
    const pages = [...(rec.pages || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (!pages.length) throw new Error("sem páginas");

    const hosted = await mapPool(pages, CONCURRENCY, async (p, i) => {
        const url = String(p.url || "");
        if (url.includes("iili.io") || url.includes("freeimage.host")) {
            return { ...p, index: p.index ?? i, url, origem: "freeimage" };
        }
        const buf = await fetchPageBuffer(url);
        if (UPLOAD_DELAY_MS) await sleep(UPLOAD_DELAY_MS);
        const ext = (url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i)?.[1] || "jpg").replace("jpeg", "jpg");
        const out = await uploadImage(buf, `${String((p.index ?? i) + 1).padStart(3, "0")}.${ext}`);
        return {
            index: p.index ?? i,
            url: out,
            origem: "freeimage",
            migratedFrom: p.origem || rec.hosting || "github-cdn"
        };
    });

    if (hosted.some((h) => !h?.url)) throw new Error("página sem URL após upload");

    return {
        ...rec,
        hosting: "freeimage",
        pages: hosted,
        migratedFrom: rec.hosting || rec.migratedFrom || "github-cdn",
        hostedAt: new Date().toISOString(),
        localPurged: true
    };
}

function updateCatalogHosting(catalogo, mangaId, capId) {
    const manga = (catalogo.mangas || []).find((m) => m.id === mangaId);
    if (!manga) return;
    const cap = (manga.capitulos || []).find((c) => c.id === capId);
    if (cap) {
        cap.hosting = "freeimage";
        cap.publicadoEm = new Date().toISOString();
    }
}

function pickProbeUrl(cloud) {
    for (const rec of Object.values(cloud.caps || {})) {
        if (rec.hosting !== "github-cdn") continue;
        const url = rec.pages?.[0]?.url;
        if (url && String(url).includes("/api/gh-cdn/")) return String(url);
    }
    return "https://akira-scan.pages.dev/api/gh-cdn/15/pages/probe.jpg";
}

async function proxyHealthy(url) {
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { "User-Agent": "AkiraScan-Rehost/1.0", Accept: "image/*,*/*" },
            signal: AbortSignal.timeout(20_000)
        });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) return false;
        if (ct.includes("image/")) return true;
        // alguns paths 404 = token ok mas ficheiro em falta
        return false;
    } catch {
        return false;
    }
}

async function waitForProxy(cloud) {
    const probe = pickProbeUrl(cloud);
    console.log(`A aguardar gh-cdn saudável…\n  probe: ${probe.slice(0, 90)}`);
    for (;;) {
        const ok = await proxyHealthy(probe);
        if (ok) {
            console.log("gh-cdn OK — a continuar rehost\n");
            return;
        }
        console.log(`[wait] gh-cdn ainda 502/403 — nova tentativa em ${Math.round(PROXY_PROBE_MS / 1000)}s`);
        await sleep(PROXY_PROBE_MS);
    }
}

const cloud = JSON.parse(fs.readFileSync(CLOUD, "utf8"));
const catalogo = readJsonFile(CATALOGO, { mangas: [] });
const progress = loadProgress();
if (!progress.startedAt) progress.startedAt = new Date().toISOString();
if (CLEAR_FAILED) {
    progress.failed = {};
    progress.fail = 0;
}

if (WAIT_PROXY) {
    await waitForProxy(cloud);
}

const queue = Object.entries(cloud.caps || {})
    .filter(([, rec]) => {
        if (rec.hosting !== "github-cdn") return false;
        if (MANGA && rec.mangaId !== MANGA) return false;
        const key = `${rec.mangaId}/${rec.capId}`;
        if (progress.done[key]) return false;
        const pages = rec.pages || [];
        if (pages.length && pages.every((p) => String(p.url || "").includes("iili.io"))) return false;
        return true;
    })
    .map(([key, rec]) => ({ key, rec }));

const work = LIMIT > 0 ? queue.slice(0, LIMIT) : queue;
console.log(`\n=== Rehost gh-cdn → Freeimage ===`);
console.log(`  fila: ${work.length} caps (de ${queue.length} pendentes)`);
console.log(`  concurrency: ${CONCURRENCY}  delay: ${UPLOAD_DELAY_MS}ms  pageRetries: ${PAGE_RETRIES}\n`);

let ok = 0;
let fail = 0;
let streakFail = 0;
const t0 = Date.now();

for (let i = 0; i < work.length; i++) {
    const { key, rec } = work[i];
    const label = `${rec.mangaId} #${rec.numero} (${(rec.pages || []).length}p)`;
    try {
        const updated = await rehostCap(rec);
        cloud.caps[key] = updated;
        updateCatalogHosting(catalogo, rec.mangaId, rec.capId);
        progress.done[key] = {
            at: new Date().toISOString(),
            pages: updated.pages.length,
            sample: updated.pages[0]?.url
        };
        delete progress.failed[key];
        ok++;
        streakFail = 0;
        console.log(`[OK ${ok}/${work.length}] ${label} → ${updated.pages[0]?.url?.slice(0, 50)}`);
    } catch (err) {
        fail++;
        streakFail++;
        progress.failed[key] = { at: new Date().toISOString(), error: String(err.message || err).slice(0, 200) };
        console.error(`[FAIL ${fail}] ${label}: ${err.message || err}`);
        if (/rate|limit|429/i.test(String(err.message || ""))) {
            console.warn("Rate limit — pausa 60s");
            await sleep(60_000);
        } else if (isTransientGetError(err) && streakFail >= 3) {
            const pause = Math.min(600_000, 30_000 * streakFail);
            console.warn(`Proxy instável (${streakFail} falhas) — pausa ${Math.round(pause / 1000)}s`);
            await sleep(pause);
            if (WAIT_PROXY) await waitForProxy(cloud);
            streakFail = 0;
        }
    }

    if ((ok + fail) % CHECKPOINT_EVERY === 0 || i === work.length - 1) {
        saveCloud(cloud);
        catalogo.atualizadoEm = new Date().toISOString();
        writeJsonAtomic(CATALOGO, catalogo);
        progress.updatedAt = new Date().toISOString();
        progress.ok = Object.keys(progress.done).length;
        progress.fail = Object.keys(progress.failed).length;
        saveProgress(progress);
        const elapsed = (Date.now() - t0) / 1000;
        const rate = ok / Math.max(elapsed, 1);
        console.log(`[checkpoint] ok=${ok} fail=${fail} doneTotal=${progress.ok} ${rate.toFixed(2)} caps/s`);
    }
}

console.log("\n=== Fim ===");
console.log(JSON.stringify({
    processed: ok + fail,
    ok,
    fail,
    doneTotal: Object.keys(progress.done).length,
    failedTotal: Object.keys(progress.failed).length,
    elapsedSec: Math.round((Date.now() - t0) / 1000)
}, null, 2));

if (fail > 0 && ok === 0) process.exit(1);
