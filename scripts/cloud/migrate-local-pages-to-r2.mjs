/**
 * Republica caps locais (data/cloud/pages) via API R2.
 * Uso: AKIRA_PUBLISH_TOKEN=... node scripts/cloud/migrate-local-pages-to-r2.mjs [--limit=5]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishLocalChapterDir, publishApiBaseUrl } from "./publish-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const PAGES_ROOT = path.join(ROOT, "data", "cloud", "pages");
const INDEX_PATH = path.join(ROOT, "data", "cloud", "chapters-index.json");

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

const token = process.env.AKIRA_PUBLISH_TOKEN;
const baseUrl = publishApiBaseUrl(process.env.AKIRA_SCAN_BASE_URL || "https://akira-scan.pages.dev");

if (!token) {
    console.error("Defina AKIRA_PUBLISH_TOKEN");
    process.exit(1);
}

const idx = fs.existsSync(INDEX_PATH)
    ? JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"))
    : { caps: {} };

let done = 0;
for (const [key, rec] of Object.entries(idx.caps || {})) {
    if (done >= LIMIT) break;
    const dir = path.join(PAGES_ROOT, rec.mangaId, rec.capId);
    if (!fs.existsSync(dir)) continue;
    const usesApi = rec.pages?.some((p) => String(p.url || "").includes("/api/cloud/page"));
    if (usesApi) continue;

    console.log(`Publicando ${key}…`);
    await publishLocalChapterDir({
        baseUrl,
        token,
        mangaId: rec.mangaId,
        capId: rec.capId,
        chapterMeta: {
            dir,
            numero: rec.numero,
            titulo: rec.titulo
        }
    });
    done++;
}

console.log(`\nConcluído: ${done} cap(s) migrados para R2.`);
