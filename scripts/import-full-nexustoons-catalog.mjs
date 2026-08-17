#!/usr/bin/env node
/**
 * Importa metadados de TODO o catálogo NexusToons → config + catalogo.json
 * (stubs sem capítulos — caps entram no bulk).
 *
 * Uso:
 *   npm run import:nexustoons:full-catalog
 *   npm run import:nexustoons:full-catalog -- --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createAdapter } from "../bots/nexustoons-akira/capture/nexustoons.js";
import { akiraMangaId } from "../bots/nexustoons-akira/shared/ids.js";
import { fetchAllNexusMangas, buildAkiraIdLookup } from "../bots/nexustoons-akira/shared/nexus-catalog.js";
import { mapNexusToCatalog, mergeCatalogoMeta } from "../bots/nexustoons-akira/shared/nexus-metadata.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const CONFIG_MANGAS = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");

const DRY_RUN = process.argv.includes("--dry-run");

function saveJson(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, p);
}

async function main() {
    const catalogo = JSON.parse(fs.readFileSync(CATALOGO, "utf8"));
    const config = fs.existsSync(CONFIG_MANGAS)
        ? JSON.parse(fs.readFileSync(CONFIG_MANGAS, "utf8"))
        : { mangas: [] };

    const idBySlug = buildAkiraIdLookup(config);
    const catalogById = new Map((catalogo.mangas || []).map((m) => [m.id, m]));

    console.log("\n=== Import catálogo completo NexusToons ===\n");
    console.log("A buscar obras na API…");

    const capture = createAdapter();
    const nexusList = await fetchAllNexusMangas(capture, {
        onProgress: ({ fetched }) => {
            if (fetched % 1000 === 0) process.stdout.write(`  ${fetched}…\n`);
        }
    });
    await capture.close?.();

    console.log(`\nNexusToons: ${nexusList.length} obras`);
    console.log(`Akira existentes: ${catalogById.size} | slugs mapeados: ${idBySlug.size}`);

    let catalogAdded = 0;
    let configAdded = 0;
    const configSlugs = new Set((config.mangas || []).map((m) => m.nexusSlug || m.slug));

    for (const n of nexusList) {
        const akiraId = idBySlug.get(n.slug) || akiraMangaId(n.slug, null);

        if (!configSlugs.has(n.slug)) {
            config.mangas = config.mangas || [];
            config.mangas.push({
                nexusSlug: n.slug,
                akiraId,
                title: n.title,
                enabled: true
            });
            configSlugs.add(n.slug);
            configAdded++;
        }

        if (!catalogById.has(akiraId)) {
            const stub = mapNexusToCatalog({
                title: n.title,
                slug: n.slug,
                id: n.id,
                coverImage: n.coverImage || n.cover,
                status: n.status,
                type: n.type
            }, akiraId);
            stub.capitulos = [];
            stub.totalCapitulos = 0;
            catalogo.mangas = catalogo.mangas || [];
            catalogo.mangas.push(stub);
            catalogById.set(akiraId, stub);
            catalogAdded++;
        } else {
            mergeCatalogoMeta(catalogById.get(akiraId), mapNexusToCatalog({
                title: n.title,
                slug: n.slug,
                id: n.id,
                coverImage: n.coverImage || n.cover,
                status: n.status,
                type: n.type
            }, akiraId));
        }
    }

    config.updatedAt = new Date().toISOString();
    config.totalNexus = nexusList.length;
    config.totalAkira = catalogo.mangas?.length || 0;
    config.enabled = (config.mangas || []).filter((m) => m.enabled !== false).length;
    config.fullCatalog = true;

    catalogo.atualizadoEm = new Date().toISOString();
    catalogo.fonte = catalogo.fonte?.includes("nexustoons")
        ? catalogo.fonte
        : `${catalogo.fonte || "catalogo"}+nexustoons-full`;

    console.log(`\nNovos no config: +${configAdded} (total ${config.mangas.length})`);
    console.log(`Novos no catálogo: +${catalogAdded} (total ${catalogo.mangas.length})`);

    if (DRY_RUN) {
        console.log("\n[dry-run] Nada gravado.");
        return;
    }

    saveJson(CONFIG_MANGAS, config);
    saveJson(CATALOGO, catalogo);
    console.log("\n✓ config.mangas.json + catalogo.json atualizados");

    const buildScript = path.join(ROOT, "scripts", "build-catalog-index.mjs");
    if (fs.existsSync(buildScript)) {
        console.log("Reconstruindo catalogo-index…");
        const { spawnSync } = await import("node:child_process");
        spawnSync(process.execPath, [buildScript], { cwd: ROOT, stdio: "inherit" });
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
