/**
 * Paginação do catálogo completo NexusToons (/api/mangas).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CONFIG_MANGAS = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");

function loadConfigMangas() {
    if (!fs.existsSync(CONFIG_MANGAS)) return [];
    try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_MANGAS, "utf8"));
        return cfg.mangas || [];
    } catch {
        return [];
    }
}

/** Lista mínima a partir do config local quando a API Nexus está bloqueada. */
export function nexusListFromConfig(config) {
    const mangas = config?.mangas || loadConfigMangas();
    return mangas
        .filter((m) => m.enabled !== false)
        .map((m) => ({
            id: m.akiraId || "",
            slug: m.nexusSlug || m.slug,
            title: m.title || m.nexusSlug || m.slug
        }))
        .filter((m) => m.slug);
}

export async function fetchAllNexusMangas(capture, { limit = 100, onProgress } = {}) {
    try {
        const all = [];
        let page = 1;

        for (;;) {
            const batch = await capture.listMangas({ page, limit });
            if (!batch.length) break;
            all.push(...batch);
            onProgress?.({ page, fetched: all.length, batchSize: batch.length });
            if (batch.length < limit) break;
            page++;
        }

        return all;
    } catch (e) {
        const fallback = nexusListFromConfig();
        if (fallback.length) {
            onProgress?.({
                page: 0,
                fetched: fallback.length,
                batchSize: fallback.length,
                fallback: "config.mangas.json"
            });
            console.warn(`[nexus-catalog] API Nexus falhou (${e.message}) — usando ${fallback.length} obras do config local`);
            return fallback;
        }
        throw e;
    }
}

/** Mapa slug → akiraId a partir de config.mangas.json (preserva IDs já mapeados). */
export function buildAkiraIdLookup(config) {
    const bySlug = new Map();
    for (const m of config?.mangas || []) {
        const slug = m.nexusSlug || m.slug;
        if (slug && m.akiraId) bySlug.set(slug, m.akiraId);
    }
    return bySlug;
}

/** Filtra lista por shard "1/4" (índice 0-based internamente). */
export function applyShard(items, shardSpec) {
    if (!shardSpec) return items;
    const m = String(shardSpec).match(/^(\d+)\/(\d+)$/);
    if (!m) return items;
    const shardIdx = Number(m[1]) - 1;
    const shardTotal = Number(m[2]);
    if (shardIdx < 0 || shardTotal < 1 || shardIdx >= shardTotal) return items;
    return items.filter((_, i) => i % shardTotal === shardIdx);
}

/** Fila rápida sem getManga por obra (ideal para 13k+ mangás). */
export function buildFastMangaQueue(nexusList, config, { shard } = {}) {
    const idBySlug = buildAkiraIdLookup(config);
    let queue = nexusList.map((n) => ({
        nexusSlug: n.slug,
        slug: n.slug,
        akiraId: idBySlug.get(n.slug) || null,
        title: n.title,
        enabled: true
    }));
    if (shard) queue = applyShard(queue, shard);
    return queue;
}

/** Mangás que já têm ≥1 cap publicado no índice cloud (modo latest-only). */
export function mangasWithCloudCaps(cloudIndex) {
    const set = new Set();
    for (const rec of Object.values(cloudIndex?.caps || {})) {
        if (rec?.mangaId && rec.done) set.add(rec.mangaId);
    }
    return set;
}
