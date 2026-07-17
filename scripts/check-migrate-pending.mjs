#!/usr/bin/env node
/**
 * Verifica se ainda há mangás pendentes para migração bulk.
 * Exit 0 = há pendências · Exit 1 = fila vazia
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, isMangaFullyInState } from "../bots/nexustoons-akira/shared/state.js";
import { createAdapter } from "../bots/nexustoons-akira/capture/nexustoons.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(__dirname, "..", "bots", "nexustoons-akira", "config.mangas.json");

function loadEnabled() {
    if (!fs.existsSync(CONFIG)) return [];
    const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    return (cfg.mangas || []).filter((m) => m.enabled !== false);
}

const enabled = loadEnabled();
const state = loadState();
const capture = createAdapter();
let pending = 0;
let invalid = 0;

for (const m of enabled) {
    const slug = m.nexusSlug || m.slug;
    try {
        const detail = await capture.getManga(slug);
        const chapters = detail.chapters?.length || 0;
        if (!isMangaFullyInState(state, slug, chapters, m.akiraId || null)) pending++;
    } catch {
        invalid++;
    }
}

await capture.close();

console.log(JSON.stringify({ pending, invalid, enabled: enabled.length }, null, 2));
process.exit(pending > 0 ? 0 : 1);
