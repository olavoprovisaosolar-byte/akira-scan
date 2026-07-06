/**
 * Apaga páginas locais de caps já enviados ao Terabox (libera disco).
 * Uso: node scripts/terabox/purge-local.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { apagarPaginasLocais, lerUploadState } from "./upload-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const MANGAS_DIR = path.join(ROOT, "data", "toonlivre-backup", "mangas");
const BIBLIOTECA = path.join(ROOT, "Biblioteca_Mangas");
const STATE_FILE = path.join(ROOT, "data", "terabox", "upload-state.json");

function guardarState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function formatMb(bytes) {
    return (bytes / 1024 / 1024).toFixed(1);
}

const state = lerUploadState();
let freed = 0;
let purged = 0;

for (const [key, entry] of Object.entries(state.caps || {})) {
    if (!entry.done || entry.localPurged) continue;
    const [mangaId, capId] = key.split("/");
    const pagesDir = path.join(MANGAS_DIR, mangaId, "chapters", capId, "pages");
    const n = fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).length : 0;
    if (n === 0) {
        entry.localPurged = true;
        continue;
    }
    freed += apagarPaginasLocais(pagesDir, BIBLIOTECA, mangaId, capId);
    entry.localPurged = true;
    entry.purgedAt = new Date().toISOString();
    purged++;
    console.log(`  🗑 ${key} (${n} arquivos)`);
}

guardarState(state);
console.log(`\n✓ ${purged} caps apagados localmente · ${formatMb(freed)} MB liberados`);
