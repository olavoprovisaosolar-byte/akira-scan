#!/usr/bin/env node
/**
 * Importação bulk production-grade — backfill completo com checkpoint, rate limit e deploy em lote.
 *
 * Uso:
 *   npm run bot:nexustoons:bulk -- --slug=gye-baeksun-sem-emprego-e-sem-dinheiro
 *   npm run bot:nexustoons:bulk -- --all
 *   npm run bot:nexustoons:bulk -- --slug=SLUG --dry-run
 *   npm run bot:nexustoons:bulk -- --all --no-deploy
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_MANGAS = path.join(__dirname, "..", "config.mangas.json");

process.env.NEXUSTOONS_BULK = "1";

const rawArgs = process.argv.slice(2);
const ALL_MANGAS = rawArgs.includes("--all");
const slugArg = rawArgs.find((a) => a.startsWith("--slug="))?.split("=")[1]
    || (rawArgs.includes("--slug") ? rawArgs[rawArgs.indexOf("--slug") + 1] : null);

if (!slugArg && !ALL_MANGAS) {
    console.error("[CRÍTICO] bulk import exige --slug=SLUG ou --all");
    process.exit(1);
}

if (!rawArgs.includes("--all-chapters")) {
    process.argv.push("--all-chapters");
}

const skipDeploy = rawArgs.includes("--no-deploy");
if (!skipDeploy && !rawArgs.includes("--batch-deploy")) {
    process.argv.push("--batch-deploy");
}
if (skipDeploy && !rawArgs.includes("--no-deploy")) {
    process.argv.push("--no-deploy");
}

function loadEnabledMangas() {
    if (!fs.existsSync(CONFIG_MANGAS)) return [];
    try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_MANGAS, "utf8"));
        return (cfg.mangas || []).filter((m) => m.enabled !== false);
    } catch {
        return [];
    }
}

const { setLogFile } = await import("../shared/logger.js");

if (ALL_MANGAS) {
    process.env.NEXUSTOONS_MULTI_BULK = "1";
    setLogFile("bulk-all-nexustoons.log");
} else {
    process.env.NEXUSTOONS_BULK_SLUG = slugArg;
    setLogFile(`bulk-${slugArg.replace(/[^\w-]/g, "_").slice(0, 40)}.log`);
}

const { main } = await import("../index.js");

main().catch(async (e) => {
    const { log } = await import("../shared/logger.js");
    const { closeCaptureAdapter } = await import("../capture/adapter.js");
    const { closeHostingAdapter } = await import("../hosting/adapter.js");
    const { closeUploadAdapter } = await import("../upload/adapter.js");
    log.critical("Bulk import falhou", { err: e.message, stack: e.stack });
    await closeCaptureAdapter();
    await closeHostingAdapter();
    await closeUploadAdapter();
    process.exit(1);
});

const isMain = process.argv[1]
    && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

export { isMain };
