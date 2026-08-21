#!/usr/bin/env node
/**
 * Reconstrói capitulos do catalogo.json a partir do chapters-index.json.
 * Também cria entradas de mangá ausentes no catálogo.
 *
 * Uso: node scripts/rebuild-catalogo-from-cloud.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    capLegivelIndice,
    legibleCapsForManga,
    readJsonFile,
    writeJsonAtomic
} from "./lib/chapter-index-utils.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const CLOUD = path.join(ROOT, "data", "cloud", "chapters-index.json");
const CONFIG = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");

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

function capFromIndex(rec) {
    const num = Number(rec.numero);
    return {
        id: rec.capId,
        numero: Number.isFinite(num) ? num : rec.numero,
        titulo: rec.titulo || `Capítulo ${rec.numero}`,
        publicadoEm: rec.hostedAt || rec.capturedAt || new Date().toISOString(),
        novo: true,
        origem: rec.origem || "nexustoons",
        hosting: rec.hosting || "cloud"
    };
}

const catalogo = readJsonFile(CATALOGO, { mangas: [] });
const cloud = readJsonFile(CLOUD, { caps: {}, porManga: {} });
const config = readJsonFile(CONFIG, { mangas: [] });
const titleById = new Map();
for (const m of config.mangas || []) {
    if (m.akiraId) titleById.set(m.akiraId, m.title || m.nexusSlug || m.akiraId);
}

cloud.porManga = recomputePorManga(cloud.caps);
writeJsonAtomic(CLOUD, {
    ...cloud,
    atualizadoEm: new Date().toISOString(),
    origem: cloud.origem || "rebuild-catalogo",
    total: Object.keys(cloud.caps || {}).length
});

const byId = new Map((catalogo.mangas || []).map((m) => [m.id, m]));
let created = 0;
let updated = 0;
let totalCaps = 0;

for (const [mangaId, stats] of Object.entries(cloud.porManga || {})) {
    if ((stats.legibleCaps || 0) <= 0) continue;
    let manga = byId.get(mangaId);
    if (!manga) {
        manga = {
            id: mangaId,
            titulo: titleById.get(mangaId) || mangaId,
            slug: mangaId,
            capitulos: [],
            origem: "nexustoons"
        };
        catalogo.mangas = catalogo.mangas || [];
        catalogo.mangas.push(manga);
        byId.set(mangaId, manga);
        created++;
    }
    const legible = legibleCapsForManga(cloud, mangaId);
    const kept = [...legible.values()]
        .map(capFromIndex)
        .sort((a, b) => Number(b.numero) - Number(a.numero));
    if ((manga.capitulos || []).length !== kept.length) updated++;
    manga.capitulos = kept;
    manga.totalCapitulos = kept.length;
    totalCaps += kept.length;
    if (kept.length) {
        manga.ultimoCapitulo = kept[0];
        manga.atualizadoEm = new Date().toISOString();
    }
}

// Limpar caps de obras sem páginas legíveis (evita "Ler" fantasma no catálogo)
let cleared = 0;
for (const manga of catalogo.mangas || []) {
    const stats = cloud.porManga?.[manga.id];
    const legibleN = stats?.legibleCaps || 0;
    if (legibleN > 0) continue;
    if ((manga.capitulos || []).length) {
        manga.capitulos = [];
        manga.totalCapitulos = 0;
        manga.ultimoCapitulo = null;
        cleared++;
    }
}
totalCaps = (catalogo.mangas || []).reduce((a, m) => a + (m.capitulos || []).length, 0);

catalogo.atualizadoEm = new Date().toISOString();
writeJsonAtomic(CATALOGO, catalogo);

console.log(JSON.stringify({
    mangas: (catalogo.mangas || []).length,
    created,
    updated,
    cleared,
    mangasWithCaps: (catalogo.mangas || []).filter((m) => (m.capitulos || []).length > 0).length,
    caps: totalCaps,
    cloudCaps: Object.keys(cloud.caps || {}).length,
    cloudLegibleMangas: Object.values(cloud.porManga).filter((p) => (p.legibleCaps || 0) > 0).length
}, null, 2));
