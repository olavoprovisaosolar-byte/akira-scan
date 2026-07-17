/**
 * Diagnóstico: caps "Em breve" vs índice cloud.
 * node scripts/diagnose-legivel.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CATALOG_INDEX = path.join(ROOT, "data", "catalogo-index.json");
const CATALOG_FULL = path.join(ROOT, "data", "catalogo.json");
const CLOUD_INDEX = path.join(ROOT, "data", "cloud", "chapters-index.json");

function lerJson(f, fb = null) {
    if (!fs.existsSync(f)) return fb;
    try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; }
}

function capTemTelegra(rec) {
    return !!(rec?.pages?.some((p) => String(p.url || "").includes("telegra.ph")));
}

/** Mesma lógica do site estático (Cloudflare Pages / GitHub Pages). */
function capLegivelStatic(rec) {
    return capTemTelegra(rec);
}

function capLegivelLocal(rec) {
    if (capTemTelegra(rec)) return true;
    if (!rec?.done) return true;
    if (!rec.localPurged) return true;
    return false;
}

const catalogIndex = lerJson(CATALOG_INDEX, { mangas: [] });
const catalogFull = lerJson(CATALOG_FULL, { mangas: [] });
const cloudIdx = lerJson(CLOUD_INDEX, { caps: {}, porManga: {} });

const porManga = cloudIdx.porManga || {};
const caps = cloudIdx.caps || {};

// Stats globais
let totalDone = 0;
let totalLegible = 0;
let totalNotDone = 0;
let doneButNotLegible = 0;

for (const rec of Object.values(caps)) {
    if (rec.done) totalDone++;
    else totalNotDone++;
    if (capLegivelStatic(rec)) totalLegible++;
    else if (rec.done) doneButNotLegible++;
}

// Mismatch catalog-index vs cloud-index
const mismatches = [];
const missingInCatalog = [];
const lowSyncProntos = [];

for (const m of catalogIndex.mangas || []) {
    const info = porManga[m.id];
    const catalogSync = m.syncProntos ?? 0;
    const cloudLegible = info?.legibleCaps ?? info?.doneCaps ?? 0;
    const cloudDone = info?.doneCaps ?? 0;
    const cloudTotal = info?.totalCaps ?? 0;

    if (info && catalogSync < cloudLegible) {
        mismatches.push({
            id: m.id,
            titulo: m.titulo,
            catalogSync,
            cloudLegible,
            cloudDone,
            cloudTotal,
            diff: cloudLegible - catalogSync
        });
    }

    if (info && cloudLegible > 0 && catalogSync === 0) {
        lowSyncProntos.push({ id: m.id, titulo: m.titulo, cloudLegible, cloudDone, cloudTotal });
    }
}

// Caps in cloud but not in catalog full
const catalogCapIds = new Map();
for (const m of catalogFull.mangas || []) {
    const ids = new Set((m.capitulos || []).map((c) => c.id));
    catalogCapIds.set(m.id, ids);
}

const capsMissingFromCatalog = [];
for (const [key, rec] of Object.entries(caps)) {
    const [mangaId, capId] = key.split("/");
    const catIds = catalogCapIds.get(mangaId);
    if (!catIds) continue;
    if (!catIds.has(capId) && rec.done) {
        capsMissingFromCatalog.push({ mangaId, capId, done: rec.done, legivel: capLegivelStatic(rec) });
    }
}

// Upload queue (legado Terabox — dados preservados em data/terabox/)
const uploadStatePath = path.join(ROOT, "data", "terabox", "upload-state.json");
const uploadState = lerJson(uploadStatePath, { caps: {} });
const stateCaps = Object.values(uploadState.caps || {});
const uploadDone = stateCaps.filter((c) => c.done).length;
const uploadPending = stateCaps.filter((c) => !c.done && (c.uploaded || 0) > 0).length;
const uploadNotStarted = stateCaps.filter((c) => !c.done && !(c.uploaded || 0)).length;

console.log("=== DIAGNÓSTICO LEGÍVEL ===\n");
console.log(`Cloud index: ${Object.keys(caps).length} caps total`);
console.log(`  done: ${totalDone} | legíveis (static): ${totalLegible} | done mas não legível: ${doneButNotLegible}`);
console.log(`  not done: ${totalNotDone}`);
console.log(`  mangás no porManga: ${Object.keys(porManga).length}`);
console.log(`  mangás com legibleCaps>0: ${Object.values(porManga).filter((p) => (p.legibleCaps ?? p.doneCaps ?? 0) > 0).length}`);

console.log(`\nCatálogo-index: ${catalogIndex.mangas?.length || 0} mangás`);
const comSync = (catalogIndex.mangas || []).filter((m) => (m.syncProntos || 0) > 0).length;
const totalSync = (catalogIndex.mangas || []).reduce((n, m) => n + (m.syncProntos || 0), 0);
console.log(`  com syncProntos>0: ${comSync} | total syncProntos: ${totalSync}`);

console.log(`\nMISMATCH catalogo-index syncProntos < cloud legibleCaps: ${mismatches.length}`);
if (mismatches.length) {
    mismatches.sort((a, b) => b.diff - a.diff);
    for (const x of mismatches.slice(0, 15)) {
        console.log(`  ${x.id} "${x.titulo?.slice(0, 40)}": catalog=${x.catalogSync} cloud=${x.cloudLegible} (done=${x.cloudDone})`);
    }
}

console.log(`\nMangás com cloud legível mas syncProntos=0: ${lowSyncProntos.length}`);
for (const x of lowSyncProntos.slice(0, 10)) {
    console.log(`  ${x.id}: legible=${x.cloudLegible} done=${x.cloudDone}`);
}

console.log(`\nCaps done no cloud mas ausentes no catalogo.json: ${capsMissingFromCatalog.length}`);
const byManga = {};
for (const c of capsMissingFromCatalog) {
    byManga[c.mangaId] = (byManga[c.mangaId] || 0) + 1;
}
const topMissing = Object.entries(byManga).sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [id, n] of topMissing) {
    console.log(`  ${id}: ${n} caps missing`);
}

console.log(`\nUpload state: ${stateCaps.length} caps`);
console.log(`  done: ${uploadDone} | em progresso: ${uploadPending} | não iniciados: ${uploadNotStarted}`);

// Caps legados Terabox (sem Telegra) — requerem migração
const legacyTerabox = Object.entries(caps).filter(([, r]) => r.remote && !capTemTelegra(r));
console.log(`\nCaps legados Terabox (sem Telegra, não legíveis): ${legacyTerabox.length}`);

// Done but purged without telegra (broken on static host)
const broken = Object.entries(caps).filter(([, r]) => r.done && r.localPurged && !capTemTelegra(r));
console.log(`Caps done+purged sem Telegra (quebrados no site estático): ${broken.length}`);

console.log(`\nCloud index atualizado: ${cloudIdx.atualizadoEm || "?"}`);
console.log(`Catalog index atualizado: ${catalogIndex.atualizadoEm || "?"}`);
