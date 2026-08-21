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
const LIVE_BASE = (process.env.AKIRA_SCAN_BASE_URL || process.env.AKIRA_PUBLISH_BASE_URL || "https://akira-scan.pages.dev").replace(/\/$/, "");

async function loadBestCloudIndex() {
    let local = loadCloudIndex();
    const localCount = Object.keys(local.caps || {}).length;
    try {
        const res = await fetch(`${LIVE_BASE}/data/cloud/chapters-index.json`, {
            headers: { Accept: "application/json" }
        });
        if (res.ok) {
            const live = await res.json();
            const liveCount = Object.keys(live.caps || {}).length;
            if (liveCount > localCount) {
                console.error(`[sprint-pending] usando índice live (${liveCount} > local ${localCount})`);
                return live;
            }
        }
    } catch (e) {
        console.error("[sprint-pending] live index indisponível:", e.message);
    }
    return local;
}

try {
    let config = { mangas: [] };
    if (fs.existsSync(CONFIG)) {
        try { config = JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { /* ignore */ }
    }

    const capture = createAdapter();
    const nexusList = await fetchAllNexusMangas(capture);
    await capture.close?.();

    const queue = buildFastMangaQueue(nexusList, config);
    const hasCaps = mangasWithCloudCaps(await loadBestCloudIndex());
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
