#!/usr/bin/env node
/**
 * Mescla o chapters-index do site (live) no ficheiro local — nunca encolhe o índice.
 *
 * Uso:
 *   node scripts/sync-live-cloud-index.mjs
 *   node scripts/sync-live-cloud-index.mjs --base=https://akira-scan.pages.dev
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = path.join(ROOT, "data", "cloud", "chapters-index.json");
const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("--base="))?.split("=")[1]
    || process.env.AKIRA_SCAN_BASE_URL
    || process.env.AKIRA_PUBLISH_BASE_URL
    || "https://akira-scan.pages.dev").replace(/\/$/, "");

function capLegivel(rec) {
    return !!(rec?.done && Array.isArray(rec.pages) && rec.pages.length > 0);
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
        if (capLegivel(rec)) porManga[id].legibleCaps++;
    }
    return porManga;
}

function readLocal() {
    if (!fs.existsSync(LOCAL)) return { caps: {}, porManga: {} };
    try {
        return JSON.parse(fs.readFileSync(LOCAL, "utf8"));
    } catch {
        return { caps: {}, porManga: {} };
    }
}

async function fetchLive() {
    const url = `${BASE}/data/cloud/chapters-index.json`;
    const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "akira-scan-index-sync/1" }
    });
    if (!res.ok) throw new Error(`Live index HTTP ${res.status} (${url})`);
    return res.json();
}

const local = readLocal();
const live = await fetchLive();
const before = Object.keys(local.caps || {}).length;
const liveCount = Object.keys(live.caps || {}).length;

const caps = { ...(local.caps || {}), ...(live.caps || {}) };
// Preferir registo live quando ambos existem (páginas mais frescas)
for (const [k, liveRec] of Object.entries(live.caps || {})) {
    const loc = local.caps?.[k];
    if (!loc) continue;
    const livePages = liveRec?.pages?.length || 0;
    const locPages = loc?.pages?.length || 0;
    if (livePages >= locPages) caps[k] = liveRec;
}

const after = Object.keys(caps).length;
if (after < before) {
    console.error(`[sync-live-index] recusa encolher índice: local=${before} merged=${after}`);
    process.exit(1);
}

const out = {
    ...local,
    ...live,
    caps,
    porManga: recomputePorManga(caps),
    atualizadoEm: new Date().toISOString(),
    origem: "merged-live+git",
    total: after
};

fs.mkdirSync(path.dirname(LOCAL), { recursive: true });
const tmp = `${LOCAL}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(out));
fs.renameSync(tmp, LOCAL);

console.log(JSON.stringify({
    base: BASE,
    localBefore: before,
    live: liveCount,
    merged: after,
    mangas: Object.keys(out.porManga).length,
    grew: after - before
}, null, 2));
