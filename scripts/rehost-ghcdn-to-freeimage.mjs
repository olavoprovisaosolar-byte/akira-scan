#!/usr/bin/env node
/**
 * O "impossível" sem Nexus: rehost github-cdn → Freeimage (iili.io).
 * Baixa de /api/gh-cdn (já funciona) e sobe para iili permanente.
 *
 *   node scripts/rehost-ghcdn-to-freeimage.mjs
 *   node scripts/rehost-ghcdn-to-freeimage.mjs --limit=5
 *   node scripts/rehost-ghcdn-to-freeimage.mjs --concurrency=6
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
    || process.env.REHOST_CONCURRENCY || 4));
const MANGA = args.find((a) => a.startsWith("--manga="))?.split("=")[1] || "";
const CHECKPOINT_EVERY = Math.max(1, Number(process.env.REHOST_CHECKPOINT_EVERY || 5));
const PAGE_TIMEOUT_MS = Math.max(5000, Number(process.env.REHOST_PAGE_TIMEOUT_MS || 45000));
const UPLOAD_DELAY_MS = Math.max(0, Number(process.env.FREEIMAGE_DELAY_MS || 120));

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

async function fetchPageBuffer(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "AkiraScan-Rehost/1.0", Accept: "image/*,*/*" },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        redirect: "follow"
    });
    if (!res.ok) throw new Error(`GET ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html") || ct.includes("application/json")) {
        throw new Error(`não é imagem (${ct})`);
    }
    return Buffer.from(await res.arrayBuffer());
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

const cloud = JSON.parse(fs.readFileSync(CLOUD, "utf8"));
const catalogo = readJsonFile(CATALOGO, { mangas: [] });
const progress = loadProgress();
if (!progress.startedAt) progress.startedAt = new Date().toISOString();

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
console.log(`  concurrency: ${CONCURRENCY}  delay: ${UPLOAD_DELAY_MS}ms\n`);

let ok = 0;
let fail = 0;
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
        console.log(`[OK ${ok}/${work.length}] ${label} → ${updated.pages[0]?.url?.slice(0, 50)}`);
    } catch (err) {
        fail++;
        progress.failed[key] = { at: new Date().toISOString(), error: String(err.message || err).slice(0, 200) };
        console.error(`[FAIL ${fail}] ${label}: ${err.message || err}`);
        // rate-limit: pause
        if (/rate|limit|429/i.test(String(err.message || ""))) {
            console.warn("Rate limit — pausa 60s");
            await sleep(60_000);
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
        console.log(`[checkpoint] ok=${ok} fail=${fail} ${rate.toFixed(2)} caps/s`);
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
