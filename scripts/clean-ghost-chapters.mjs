/**
 * Remove caps fantasma do catálogo — só mantém entradas com páginas no índice cloud.
 *
 * Uso:
 *   node scripts/clean-ghost-chapters.mjs              # todos os mangás
 *   node scripts/clean-ghost-chapters.mjs --all          # alias explícito
 *   node scripts/clean-ghost-chapters.mjs --manga=obra-9010fd2c
 *   node scripts/clean-ghost-chapters.mjs --slug=gye-baeksun-sem-emprego-e-sem-dinheiro --dry-run
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    capLegivelIndice,
    legibleCapsForManga,
    readJsonFile,
    writeJsonAtomic
} from "./lib/chapter-index-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const CLOUD = path.join(ROOT, "data", "cloud", "chapters-index.json");
const CONFIG_MANGAS = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MANGA_FILTER = args.find((a) => a.startsWith("--manga="))?.split("=")[1]
    || (args.includes("--manga") ? args[args.indexOf("--manga") + 1] : null);
const SLUG_FILTER = args.find((a) => a.startsWith("--slug="))?.split("=")[1]
    || (args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null);

function resolveMangaIdFromSlug(slug) {
    const cfg = readJsonFile(CONFIG_MANGAS, { mangas: [] });
    const hit = cfg.mangas?.find((m) => (m.nexusSlug || m.slug) === slug);
    return hit?.akiraId || null;
}

function capFromIndex(rec) {
    const num = Number(rec.numero);
    return {
        id: rec.capId,
        numero: Number.isFinite(num) ? num : rec.numero,
        titulo: rec.titulo || `Capítulo ${rec.numero}`,
        publicadoEm: rec.hostedAt || rec.capturedAt || new Date().toISOString(),
        novo: true,
        origem: rec.origem || "nexustoons",
        hosting: rec.hosting || "telegra"
    };
}

function cleanManga(manga, cloudIndex) {
    const legible = legibleCapsForManga(cloudIndex, manga.id);
    const before = manga.capitulos?.length || 0;
    const kept = [...legible.values()]
        .map(capFromIndex)
        .sort((a, b) => Number(b.numero) - Number(a.numero));

    const removed = before - kept.length;
    manga.capitulos = kept;
    manga.totalCapitulos = kept.length;
    if (kept.length) {
        manga.ultimoCapitulo = kept[0];
        manga.atualizadoEm = new Date().toISOString();
    }
    return { removed, kept: kept.length, before };
}

function cleanCloudIndex(cloudIndex, mangaId) {
    let removed = 0;
    for (const [key, rec] of Object.entries(cloudIndex.caps || {})) {
        if (mangaId && rec.mangaId !== mangaId) continue;
        if (!capLegivelIndice(rec)) {
            delete cloudIndex.caps[key];
            removed++;
        }
    }
    if (removed) {
        cloudIndex.porManga = recomputePorManga(cloudIndex.caps);
        cloudIndex.atualizadoEm = new Date().toISOString();
    }
    return removed;
}

function recomputePorManga(capsObj) {
    const porManga = {};
    for (const rec of Object.values(capsObj || {})) {
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

const catalogo = readJsonFile(CATALOGO, { mangas: [] });
const cloudIndex = readJsonFile(CLOUD, { caps: {}, porManga: {} });

let targetMangaId = MANGA_FILTER;
if (!targetMangaId && SLUG_FILTER) {
    targetMangaId = resolveMangaIdFromSlug(SLUG_FILTER);
    if (!targetMangaId) {
        console.error(`Slug desconhecido: ${SLUG_FILTER}`);
        process.exit(1);
    }
}

const cloudCleaned = cleanCloudIndex(cloudIndex, targetMangaId);

let totalRemoved = 0;
let mangasTouched = 0;

for (const manga of catalogo.mangas || []) {
    if (targetMangaId && manga.id !== targetMangaId) continue;
    const { removed, kept, before } = cleanManga(manga, cloudIndex);
    if (removed > 0 || before !== kept) {
        mangasTouched++;
        totalRemoved += removed;
        console.log(`${manga.id}: ${before} → ${kept} caps (${removed} fantasma removidos)`);
    }
}

if (DRY_RUN) {
    console.log(`[dry-run] ${totalRemoved} caps fantasma em ${mangasTouched} mangá(s); índice cloud: ${cloudCleaned} entradas inválidas`);
    process.exit(0);
}

if (cloudCleaned) {
    writeJsonAtomic(CLOUD, cloudIndex);
    console.log(`Índice cloud: ${cloudCleaned} entradas inválidas removidas`);
}

if (totalRemoved > 0 || mangasTouched > 0) {
    catalogo.atualizadoEm = new Date().toISOString();
    writeJsonAtomic(CATALOGO, catalogo);
}

console.log(`Total: ${totalRemoved} caps fantasma removidos (${mangasTouched} mangá(s))`);
if (targetMangaId) {
    console.log(`MANGA_GHOST_REMOVED=${totalRemoved}`);
}
