/**
 * Registro de caps enviados ao Terabox — backup não re-baixa.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const STATE_FILE = path.join(ROOT, "data", "terabox", "upload-state.json");

export function lerUploadState() {
    if (!fs.existsSync(STATE_FILE)) return { caps: {} };
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch {
        return { caps: {} };
    }
}

export function capEnviadoTerabox(mangaId, capId) {
    const key = `${mangaId}/${capId}`;
    const entry = lerUploadState().caps?.[key];
    return !!(entry?.done || entry?.localPurged);
}

export function apagarPaginasLocais(pagesDir, bibliotecaRoot, mangaId, capId) {
    let freed = 0;
    if (fs.existsSync(pagesDir)) {
        for (const f of fs.readdirSync(pagesDir)) {
            const p = path.join(pagesDir, f);
            if (fs.statSync(p).isFile()) {
                freed += fs.statSync(p).size;
                fs.unlinkSync(p);
            }
        }
    }
    const bibDir = path.join(bibliotecaRoot, mangaId, capId);
    if (fs.existsSync(bibDir)) {
        for (const f of fs.readdirSync(bibDir)) {
            const p = path.join(bibDir, f);
            if (fs.statSync(p).isFile()) {
                freed += fs.statSync(p).size;
                fs.unlinkSync(p);
            }
        }
    }
    return freed;
}
