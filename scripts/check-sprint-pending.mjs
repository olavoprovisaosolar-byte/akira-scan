#!/usr/bin/env node
/**
 * Verifica pendências do sprint latest-only (catálogo completo) — rápido, sem getManga por obra.
 * Exit 0 = ainda há obras sem cap | Exit 1 = sprint completo
 * Erro de rede/Cloudflare = exit 0 (assume pendente para o workflow re-disparar).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createAdapter } from "../bots/nexustoons-akira/capture/nexustoons.js";
import { loadCloudIndex } from "../bots/nexustoons-akira/shared/state.js";
import { akiraMangaId } from "../bots/nexustoons-akira/shared/ids.js";
import {
    fetchAllNexusMangas,
    buildFastMangaQueue,
    mangasWithCloudCaps
} from "../bots/nexustoons-akira/shared/nexus-catalog.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");

try {
    let config = { mangas: [] };
    if (fs.existsSync(CONFIG)) {
        try { config = JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { /* ignore */ }
    }

    const capture = createAdapter();
    const nexusList = await fetchAllNexusMangas(capture);
    await capture.close?.();

    const queue = buildFastMangaQueue(nexusList, config);
    const hasCaps = mangasWithCloudCaps(loadCloudIndex());
    let pending = 0;

    for (const m of queue) {
        const id = m.akiraId || akiraMangaId(m.nexusSlug || m.slug, null);
        if (!hasCaps.has(id)) pending++;
    }

    const done = queue.length - pending;
    console.log(JSON.stringify({
        pending,
        done,
        total: queue.length,
        mode: "latest-only-full-catalog"
    }, null, 2));

    process.exit(pending > 0 ? 0 : 1);
} catch (e) {
    console.error("[sprint-pending] falha ao medir fila — assumindo pendente:", e.message);
    console.log(JSON.stringify({ pending: -1, error: e.message, assume: "pending" }, null, 2));
    process.exit(0);
}
