#!/usr/bin/env node
/**
 * Pendências do backfill completo (catálogo Nexus) — rápido via cloud-index + manifest.
 * Exit 0 = ainda falta baixar | Exit 1 = fila vazia (heurística)
 * Erro de rede/Cloudflare = exit 0 (assume pendente para o workflow re-disparar).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createAdapter } from "../bots/nexustoons-akira/capture/nexustoons.js";
import { loadCloudIndex } from "../bots/nexustoons-akira/shared/state.js";
import { akiraMangaId } from "../bots/nexustoons-akira/shared/ids.js";
import { fetchAllNexusMangas, buildFastMangaQueue } from "../bots/nexustoons-akira/shared/nexus-catalog.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");
const MANIFEST = path.join(ROOT, "data", "nexustoons", "manifest.json");

try {
    let config = { mangas: [] };
    if (fs.existsSync(CONFIG)) {
        try { config = JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { /* ignore */ }
    }

    let manifest = { mangas: {} };
    if (fs.existsSync(MANIFEST)) {
        try { manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch { /* ignore */ }
    }

    const capture = createAdapter();
    const nexusList = await fetchAllNexusMangas(capture);
    await capture.close?.();

    const queue = buildFastMangaQueue(nexusList, config);
    const idx = loadCloudIndex();
    const porManga = idx.porManga || {};

    let pending = 0;
    let done = 0;
    let unknown = 0;

    for (const m of queue) {
        const slug = m.nexusSlug || m.slug;
        const id = m.akiraId || akiraMangaId(slug, null);
        const legible = porManga[id]?.legibleCaps || 0;
        const man = manifest.mangas?.[slug];
        const knownTotal = Number(man?.totalChapters) || Object.keys(man?.chapters || {}).length;

        if (legible === 0) {
            pending++;
            continue;
        }
        if (knownTotal > 0 && legible >= knownTotal) {
            done++;
            continue;
        }
        if (knownTotal === 0) unknown++;
        pending++;
    }

    console.log(JSON.stringify({
        pending,
        done,
        unknown,
        total: queue.length,
        cloudCaps: Object.keys(idx.caps || {}).length,
        mode: "full-catalog-backfill"
    }, null, 2));

    process.exit(pending > 0 ? 0 : 1);
} catch (e) {
    console.error("[full-sync-pending] falha ao medir fila — assumindo pendente:", e.message);
    console.log(JSON.stringify({ pending: -1, error: e.message, assume: "pending" }, null, 2));
    process.exit(0);
}
