#!/usr/bin/env node
/**
 * Valida chapters-index + catalogo antes de deploy/sync.
 * Exit 1 se dados estiverem inconsistentes ou vazios demais.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { capLegivelIndice } from "./lib/chapter-index-utils.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOUD = path.join(ROOT, "data", "cloud", "chapters-index.json");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const MIN_CAPS = Number(process.env.AKIRA_MIN_CLOUD_CAPS || 500);

function fail(msg) {
    console.error(`[verify-cloud-data] FAIL: ${msg}`);
    process.exit(1);
}

if (!fs.existsSync(CLOUD)) fail(`ausente: ${CLOUD}`);
if (!fs.existsSync(CATALOGO)) fail(`ausente: ${CATALOGO}`);

let cloud;
let catalogo;
try {
    cloud = JSON.parse(fs.readFileSync(CLOUD, "utf8"));
    catalogo = JSON.parse(fs.readFileSync(CATALOGO, "utf8"));
} catch (err) {
    fail(`JSON inválido: ${err.message}`);
}

const caps = cloud.caps || {};
const capIds = Object.keys(caps);
const legible = capIds.filter((id) => capLegivelIndice(caps[id]));
const mangasComCaps = new Set(legible.map((id) => caps[id].mangaId).filter(Boolean));

if (capIds.length < MIN_CAPS) {
    fail(`índice demasiado pequeno: ${capIds.length} caps (mín ${MIN_CAPS})`);
}
if (legible.length < MIN_CAPS) {
    fail(`caps legíveis insuficientes: ${legible.length} (mín ${MIN_CAPS})`);
}
if (legible.length !== capIds.length) {
    console.warn(
        `[verify-cloud-data] aviso: ${capIds.length - legible.length} caps sem páginas hospedadas`
    );
}

const catMangas = catalogo.mangas || [];
let catCaps = 0;
let catMangasWithCaps = 0;
for (const m of catMangas) {
    const n = (m.capitulos || []).length;
    catCaps += n;
    if (n > 0) catMangasWithCaps++;
}

if (catCaps < Math.min(MIN_CAPS, legible.length * 0.5)) {
    fail(`catalogo.json com poucos caps: ${catCaps}`);
}

const summary = {
    cloudCaps: capIds.length,
    legibleCaps: legible.length,
    cloudMangas: mangasComCaps.size,
    catalogMangas: catMangas.length,
    catalogMangasWithCaps: catMangasWithCaps,
    catalogCaps: catCaps,
    atualizadoEm: cloud.atualizadoEm || null
};
console.log("[verify-cloud-data] OK", JSON.stringify(summary));
