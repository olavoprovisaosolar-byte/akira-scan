#!/usr/bin/env node
/**
 * Marca caps cloud-static sem ficheiros locais como localPurged
 * e recalcula porManga / total.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
    capLegivelIndice,
    readJsonFile
} from "./lib/chapter-index-utils.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOUD = path.join(ROOT, "data", "cloud", "chapters-index.json");

const cloud = readJsonFile(CLOUD, { caps: {} });
let marked = 0;

for (const rec of Object.values(cloud.caps || {})) {
    const pages = rec.pages || [];
    if (!pages.length) continue;
    const onlyStatic = pages.every((p) => String(p.url || "").includes("/data/cloud/pages/"));
    if (!onlyStatic) continue;
    if (!rec.localPurged) {
        rec.localPurged = true;
        marked++;
    }
}

const porManga = {};
for (const rec of Object.values(cloud.caps || {})) {
    const id = rec.mangaId;
    if (!id) continue;
    if (!porManga[id]) porManga[id] = { totalCaps: 0, doneCaps: 0, legibleCaps: 0, purgedCaps: 0 };
    porManga[id].totalCaps++;
    if (rec.done) porManga[id].doneCaps++;
    if (rec.localPurged) porManga[id].purgedCaps++;
    if (capLegivelIndice(rec)) porManga[id].legibleCaps++;
}

cloud.porManga = porManga;
cloud.total = Object.keys(cloud.caps || {}).length;
cloud.atualizadoEm = new Date().toISOString();
cloud.origem = cloud.origem || "mark-cloud-static-purged";

// Índice é grande — gravar compacto (como sync-live)
fs.mkdirSync(path.dirname(CLOUD), { recursive: true });
const tmp = `${CLOUD}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(cloud));
fs.renameSync(tmp, CLOUD);

const legible = Object.values(cloud.caps).filter((r) => capLegivelIndice(r)).length;
console.log(JSON.stringify({ markedPurged: marked, total: cloud.total, legible, mangas: Object.keys(porManga).length }, null, 2));
