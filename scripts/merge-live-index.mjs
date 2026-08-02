#!/usr/bin/env node
/**
 * Merge índice live (GitHub) com índice local.
 * Preferência por cap: github-cdn > catbox/litter > telegra > cloud-static
 *
 * Uso: node scripts/merge-live-index.mjs [--dry-run] [--live=URL]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recomputePorManga } from "./cloud/cloud-api-core.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = path.join(ROOT, "data", "cloud", "chapters-index.json");
const BACKUP = path.join(ROOT, "data", "cloud", "chapters-index.pre-merge.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const liveUrl = args.find((a) => a.startsWith("--live="))?.split("=")[1]
    || "https://raw.githubusercontent.com/olavoprovisaosolar-byte/akira-scan/main/data/cloud/chapters-index.json";

const HOSTING_RANK = {
    "github-cdn": 100,
    catbox: 80,
    telegra: 60,
    "cloud-static": 40,
    blogger: 30,
    r2: 20
};

function hostingScore(rec) {
    const h = String(rec?.hosting || "").toLowerCase();
    if (HOSTING_RANK[h]) return HOSTING_RANK[h];
    const url = String(rec?.pages?.[0]?.url || "");
    if (url.includes("/api/gh-cdn/")) return 100;
    if (url.includes("litter.catbox") || url.includes("catbox.moe")) return 80;
    if (url.includes("telegra.ph")) return 60;
    if (url.includes("/data/cloud/pages/")) return 40;
    return rec?.done ? 10 : 0;
}

function pickBetter(a, b) {
    if (!a) return b;
    if (!b) return a;
    const sa = hostingScore(a);
    const sb = hostingScore(b);
    if (sa !== sb) return sa > sb ? a : b;
    const ta = Date.parse(a.hostedAt || "") || 0;
    const tb = Date.parse(b.hostedAt || "") || 0;
    return tb > ta ? b : a;
}

async function fetchLive() {
    const res = await fetch(`${liveUrl}?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Live index HTTP ${res.status}`);
    return res.json();
}

function loadLocal() {
    if (!fs.existsSync(LOCAL)) return { caps: {}, porManga: {}, total: 0 };
    return JSON.parse(fs.readFileSync(LOCAL, "utf8"));
}

async function main() {
    console.log("=== Merge índice live + local ===\n");
    console.log(`Live: ${liveUrl}`);

    const [live, local] = await Promise.all([fetchLive(), Promise.resolve(loadLocal())]);
    const liveCaps = live.caps || {};
    const localCaps = local.caps || {};
    const merged = { ...localCaps };
    let added = 0;
    let upgraded = 0;
    let keptLocal = 0;

    for (const [key, liveRec] of Object.entries(liveCaps)) {
        const localRec = merged[key];
        if (!localRec) {
            merged[key] = liveRec;
            added++;
            continue;
        }
        const best = pickBetter(localRec, liveRec);
        if (best === localRec) {
            keptLocal++;
        } else {
            merged[key] = { ...liveRec, ...best, pages: best.pages || liveRec.pages };
            upgraded++;
        }
    }

    const out = {
        ...local,
        caps: merged,
        porManga: recomputePorManga(merged),
        total: Object.keys(merged).length,
        origem: "merged-live-local",
        atualizadoEm: new Date().toISOString(),
        mergeMeta: {
            liveTotal: Object.keys(liveCaps).length,
            localTotal: Object.keys(localCaps).length,
            mergedTotal: Object.keys(merged).length,
            addedFromLive: added,
            upgradedFromLive: upgraded,
            keptLocal
        }
    };

    console.log(`Live caps:   ${Object.keys(liveCaps).length}`);
    console.log(`Local caps:  ${Object.keys(localCaps).length}`);
    console.log(`Merged:      ${out.total}`);
    console.log(`+ live:      ${added}`);
    console.log(`↑ upgraded:  ${upgraded}`);
    console.log(`= kept local:${keptLocal}`);

    if (dryRun) {
        console.log("\n[dry-run] Nenhum ficheiro alterado.");
        return;
    }

    if (fs.existsSync(LOCAL)) {
        fs.copyFileSync(LOCAL, BACKUP);
        console.log(`Backup: ${BACKUP}`);
    }
    fs.writeFileSync(LOCAL, JSON.stringify(out, null, 2));
    console.log(`\n✓ Índice gravado: ${LOCAL}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
