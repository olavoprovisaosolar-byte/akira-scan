/**
 * Backup completo ToonLivre → data/toonlivre-backup/
 *
 * Uso:
 *   node scripts/backup-toonlivre-full.mjs              # backup completo (com resume)
 *   node scripts/backup-toonlivre-full.mjs --meta-only  # só metadados + capas
 *   node scripts/backup-toonlivre-full.mjs --resume     # continuar interrompido
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    pesquisarMangas,
    obterMangaPorSlug,
    obterToken,
    TOONLIVRE_BASE
} from "../netlify/functions/toonlivre-client.mjs";
import { obterPaginasCapituloServidor } from "../netlify/functions/catalogo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BACKUP = path.join(ROOT, "data", "toonlivre-backup");
const MANGAS_DIR = path.join(BACKUP, "mangas");
const STATE_FILE = path.join(BACKUP, "state.json");
const MANIFEST_FILE = path.join(BACKUP, "manifest.json");
const FAILURES_FILE = path.join(BACKUP, "failures.jsonl");
const LOG_FILE = path.join(ROOT, "logs", "backup-toonlivre.log");

const META_ONLY = process.argv.includes("--meta-only");
const RESUME = process.argv.includes("--resume") || !process.argv.includes("--fresh");
const DELAY_MS = Number(process.env.BACKUP_DELAY_MS || 400);
const PAGE_LIMIT = Number(process.env.BACKUP_PAGE_LIMIT || 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
}

function logFailure(entry) {
    fs.mkdirSync(BACKUP, { recursive: true });
    fs.appendFileSync(FAILURES_FILE, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n", "utf8");
}

function lerState() {
    if (RESUME && fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        } catch { /* novo */ }
    }
    return {
        fase: "listagem",
        mangas: {},
        stats: {
            mangasTotal: 0,
            mangasOk: 0,
            mangasFail: 0,
            capitulosTotal: 0,
            capitulosOk: 0,
            capitulosFail: 0,
            paginasTotal: 0,
            paginasOk: 0,
            paginasFail: 0,
            bytesDownloaded: 0
        },
        iniciadoEm: new Date().toISOString()
    };
}

function guardarState(state) {
    fs.mkdirSync(BACKUP, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function extFromUrl(url, contentType = "") {
    if (contentType.includes("webp")) return ".webp";
    if (contentType.includes("png")) return ".png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
    const m = String(url).match(/\.(webp|png|jpe?g|gif)(\?|$)/i);
    return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : ".webp";
}

async function downloadFile(url, destPath, referer = TOONLIVRE_BASE) {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 100) {
        return fs.statSync(destPath).size;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const token = await obterToken();
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
            Referer: referer,
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            [token.header]: token.value
        },
        redirect: "follow"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return buf.length;
}

async function listarTodosMangas() {
    const ids = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
        log(`  Listagem página ${page}/${totalPages}`);
        const data = await pesquisarMangas({ page, limit: 48, sortBy: "popular" });
        const lista = data.mangas || [];
        totalPages = data.pagination?.totalPages || page;
        for (const m of lista) {
            const id = m.id || m.uploadSlug;
            if (id && !ids.includes(id)) ids.push(id);
        }
        if (!lista.length) break;
        page++;
        await sleep(DELAY_MS);
        if (PAGE_LIMIT > 0 && page > PAGE_LIMIT) break;
    }
    return ids;
}

async function backupManga(mangaId, state) {
    const mangaDir = path.join(MANGAS_DIR, mangaId);
    const metaPath = path.join(mangaDir, "meta.json");
    const entry = state.mangas[mangaId] || { metaOk: false, capsOk: 0, capsFail: 0, pagesOk: 0, pagesFail: 0 };

    if (META_ONLY && entry.metaOk && fs.existsSync(metaPath)) {
        state.mangas[mangaId] = entry;
        return entry;
    }

    fs.mkdirSync(mangaDir, { recursive: true });

    let raw;
    if (fs.existsSync(metaPath)) {
        raw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        entry.metaOk = true;
    } else {
        try {
            raw = await obterMangaPorSlug(mangaId);
            fs.writeFileSync(metaPath, JSON.stringify(raw, null, 2), "utf8");
            entry.metaOk = true;
            state.stats.mangasOk++;
        } catch (e) {
            state.stats.mangasFail++;
            entry.erro = e.message;
            logFailure({ tipo: "manga", mangaId, motivo: e.message });
            state.mangas[mangaId] = entry;
            guardarState(state);
            return entry;
        }
    }

    if (!META_ONLY) {
        const coverUrl = raw.coverUrl || raw.cover || raw.capa || "";
        if (coverUrl && !fs.readdirSync(mangaDir).some((f) => f.startsWith("cover."))) {
            try {
                const ext = extFromUrl(coverUrl);
                const bytes = await downloadFile(coverUrl, path.join(mangaDir, `cover${ext}`), `${TOONLIVRE_BASE}/${mangaId}`);
                state.stats.bytesDownloaded += bytes;
                entry.coverLocal = `cover${ext}`;
            } catch (e) {
                logFailure({ tipo: "capa", mangaId, motivo: e.message });
            }
        }

        const chapters = raw.chapters || raw.capitulos || [];
        entry.totalCaps = chapters.length;

        for (const cap of chapters) {
            const capId = cap.id;
            const numero = Number(cap.number ?? cap.numero ?? cap.chapterNumber) || 0;
            if (!capId || numero <= 0) continue;

            if (entry.capsDone?.includes(capId)) continue;

            const pagesDir = path.join(mangaDir, "chapters", capId, "pages");
            if (fs.existsSync(pagesDir) && fs.readdirSync(pagesDir).length > 0) {
                if (!entry.capsDone) entry.capsDone = [];
                entry.capsDone.push(capId);
                entry.capsOk = (entry.capsOk || 0) + 1;
                continue;
            }

            const capDir = path.join(mangaDir, "chapters", capId);
            try {
                const { obterOuCachearCapitulo } = await import("./chapter-cache.mjs");
                const cached = await obterOuCachearCapitulo(ROOT, mangaId, capId, String(numero));
                if (cached?.length) {
                    state.stats.capitulosOk++;
                    state.stats.paginasOk += cached.length;
                    entry.capsOk = (entry.capsOk || 0) + 1;
                    entry.pagesOk = (entry.pagesOk || 0) + cached.length;
                    if (!entry.capsDone) entry.capsDone = [];
                    entry.capsDone.push(capId);
                } else {
                    throw new Error("sem páginas");
                }
            } catch (e) {
                state.stats.capitulosFail++;
                entry.capsFail = (entry.capsFail || 0) + 1;
                logFailure({ tipo: "capitulo", mangaId, capId, numero, motivo: e.message });
            }
            await sleep(DELAY_MS);
        }
    } else {
        const coverUrl = raw.coverUrl || raw.cover || "";
        if (coverUrl && !fs.readdirSync(mangaDir).some((f) => f.startsWith("cover."))) {
            try {
                const ext = extFromUrl(coverUrl);
                await downloadFile(coverUrl, path.join(mangaDir, `cover${ext}`), `${TOONLIVRE_BASE}/${mangaId}`);
            } catch { /* ok */ }
        }
    }

    state.mangas[mangaId] = entry;
    guardarState(state);
    return entry;
}

function dirSize(dir) {
    let total = 0;
    if (!fs.existsSync(dir)) return 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) total += dirSize(p);
        else total += fs.statSync(p).size;
    }
    return total;
}

function contarFalhas() {
    if (!fs.existsSync(FAILURES_FILE)) return 0;
    return fs.readFileSync(FAILURES_FILE, "utf8").trim().split("\n").filter(Boolean).length;
}

async function main() {
    log("=== Backup ToonLivre — início ===");
    fs.mkdirSync(BACKUP, { recursive: true });
    fs.mkdirSync(MANGAS_DIR, { recursive: true });

    const state = lerState();

    if (state.fase === "listagem" || !state.mangaIds?.length) {
        log("Fase 1: listagem completa do catálogo...");
        state.mangaIds = await listarTodosMangas();
        state.stats.mangasTotal = state.mangaIds.length;
        state.fase = "download";
        guardarState(state);
        log(`  ${state.mangaIds.length} mangás encontrados na API ToonLivre`);
    }

    log(`Fase 2: backup ${META_ONLY ? "(metadados + capas)" : "(completo)"}...`);
    let i = 0;
    for (const mangaId of state.mangaIds) {
        i++;
        if (META_ONLY && state.mangas[mangaId]?.metaOk) continue;
        log(`  [${i}/${state.mangaIds.length}] ${mangaId}`);
        await backupManga(mangaId, state);
        await sleep(DELAY_MS);
    }

    state.fase = "concluido";
    state.concluidoEm = new Date().toISOString();
    guardarState(state);

    const bytes = dirSize(BACKUP);
    const manifest = {
        fonte: "toonlivre",
        backupDir: "data/toonlivre-backup",
        iniciadoEm: state.iniciadoEm,
        concluidoEm: state.concluidoEm,
        mangasTotal: state.stats.mangasTotal,
        mangasOk: state.stats.mangasOk,
        mangasFail: state.stats.mangasFail,
        capitulosTotal: state.stats.capitulosTotal,
        capitulosOk: state.stats.capitulosOk,
        capitulosFail: state.stats.capitulosFail,
        paginasOk: state.stats.paginasOk,
        paginasFail: state.stats.paginasFail,
        bytesDownloaded: state.stats.bytesDownloaded,
        espacoDiscoBytes: bytes,
        espacoDiscoMB: (bytes / 1024 / 1024).toFixed(2),
        falhasRegistradas: contarFalhas(),
        metaOnly: META_ONLY
    };

    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
    log(`=== Backup concluído: ${manifest.mangasOk}/${manifest.mangasTotal} mangás | ${manifest.paginasOk} páginas | ${manifest.espacoDiscoMB} MB ===`);
    log(`Manifesto: ${MANIFEST_FILE}`);
}

main().catch((e) => {
    log(`FATAL: ${e.message}`);
    process.exit(1);
});
