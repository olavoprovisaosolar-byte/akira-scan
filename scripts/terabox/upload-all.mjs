/**
 * Envia todo o backup local de capítulos → Terabox (/meus_mangas).
 * Retoma via data/terabox/upload-state.json
 *
 * Uso:
 *   node scripts/terabox/upload-all.mjs
 *   node scripts/terabox/upload-all.mjs --fresh
 *   node scripts/terabox/upload-all.mjs --manga=obra-0f20295f
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { criarCliente, lerConfig, sleep } from "./client.mjs";
import {
    garantirEstruturaManga,
    lerTituloManga,
    listarPaginasLocais,
    uploadPasta,
    unwrapErrorMessage
} from "./upload-lib.mjs";
import { apagarPaginasLocais } from "./upload-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const MANGAS_DIR = path.join(ROOT, "data", "toonlivre-backup", "mangas");
const STATE_FILE = path.join(ROOT, "data", "terabox", "upload-state.json");
const LOG_FILE = path.join(ROOT, "logs", "terabox-upload.log");

const FRESH = process.argv.includes("--fresh");
const MANGA_FILTER = process.argv.find((a) => a.startsWith("--manga="))?.split("=")[1] || "";
const DELETE_AFTER = process.env.TERABOX_DELETE_AFTER !== "0";
const delayMs = Number(process.env.TERABOX_UPLOAD_DELAY_MS || process.env.TERABOX_DELAY_MS || 300);
const fileConcurrency = Math.max(1, Number(process.env.TERABOX_FILE_CONCURRENCY || 5));
const capDelayMs = Number(process.env.TERABOX_CAP_DELAY_MS || 200);
const chapterConcurrency = Math.max(1, Number(process.env.TERABOX_CHAPTER_CONCURRENCY || 1));
const QUIET = process.env.TERABOX_QUIET === "1";
const BIBLIOTECA = path.join(ROOT, "Biblioteca_Mangas");

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    try {
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
        fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
    } catch { /* log ocupado — só console */ }
}

function lerState() {
    if (!FRESH && fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        } catch { /* novo */ }
    }
    return { iniciadoEm: new Date().toISOString(), caps: {}, stats: { ok: 0, fail: 0, skip: 0, files: 0 } };
}

function guardarState(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function filaCaps() {
    const fila = [];
    if (!fs.existsSync(MANGAS_DIR)) return fila;

    for (const mangaId of fs.readdirSync(MANGAS_DIR)) {
        if (MANGA_FILTER && mangaId !== MANGA_FILTER) continue;
        const mangaDir = path.join(MANGAS_DIR, mangaId);
        const capsDir = path.join(mangaDir, "chapters");
        if (!fs.existsSync(capsDir)) continue;

        const titulo = lerTituloManga(mangaDir);
        for (const capId of fs.readdirSync(capsDir)) {
            const pagesDir = path.join(capsDir, capId, "pages");
            const paginas = listarPaginasLocais(pagesDir);
            if (!paginas.length) continue;

            let numero = capId;
            const metaCap = path.join(capsDir, capId, "meta.json");
            if (fs.existsSync(metaCap)) {
                try {
                    const m = JSON.parse(fs.readFileSync(metaCap, "utf8"));
                    if (m.numero != null) numero = String(m.numero);
                } catch { /* ignore */ }
            }

            fila.push({ mangaId, titulo, capId, numero, pagesDir, total: paginas.length });
        }
    }

    fila.sort((a, b) => a.mangaId.localeCompare(b.mangaId) || Number(a.numero) - Number(b.numero));
    return fila;
}

async function main() {
    const cfg = lerConfig();
    const state = lerState();
    const fila = filaCaps();

    log(`=== Upload Terabox — ${fila.length} caps${MANGA_FILTER ? ` | manga=${MANGA_FILTER}` : ""} | ${fileConcurrency} págs × ${chapterConcurrency} caps paralelos ===`);

    const clients = await Promise.all(
        Array.from({ length: chapterConcurrency }, () => criarCliente())
    );

    const mangaRemoteCache = new Map();
    const folderLocks = new Map();
    let stateLock = Promise.resolve();
    const saveState = () => {
        stateLock = stateLock.then(() => guardarState(state));
        return stateLock;
    };

    async function mangaRemote(client, mangaId, titulo) {
        if (mangaRemoteCache.has(mangaId)) return mangaRemoteCache.get(mangaId);
        if (!folderLocks.has(mangaId)) folderLocks.set(mangaId, Promise.resolve());
        const job = folderLocks.get(mangaId).then(async () => {
            if (mangaRemoteCache.has(mangaId)) return mangaRemoteCache.get(mangaId);
            const remote = await garantirEstruturaManga(client, cfg.remoteDir, mangaId, titulo);
            mangaRemoteCache.set(mangaId, remote);
            log(`Pasta obra: ${remote}`);
            return remote;
        });
        folderLocks.set(mangaId, job);
        return job;
    }

    async function processarCap(item, index, client) {
        const key = `${item.mangaId}/${item.capId}`;
        if (state.caps[key]?.done) {
            state.stats.skip++;
            return;
        }

        const mangaRemotePath = await mangaRemote(client, item.mangaId, item.titulo);
        const capRemote = `${mangaRemotePath}/chapters/cap-${item.numero}`;
        log(`[${index}/${fila.length}] ${item.mangaId} cap.${item.numero} (${item.total} págs)`);

        try {
            const resultados = await uploadPasta(client, item.pagesDir, capRemote, delayMs, {
                concurrency: fileConcurrency,
                retries: 3,
                onFile: QUIET ? undefined : (f) => log(`  ↑ ${f}`)
            });
            const ok = resultados.filter((r) => r.ok).length;
            const falhas = resultados.filter((r) => !r.ok);

            state.stats.files += ok;
            state.stats.ok += ok === item.total ? 1 : 0;
            state.stats.fail += ok < item.total ? 1 : 0;
            state.caps[key] = {
                done: ok === item.total,
                uploaded: ok,
                total: item.total,
                remote: capRemote,
                at: new Date().toISOString(),
                ...(falhas.length ? { erros: falhas.slice(0, 3).map((f) => f.erro || f.file) } : {})
            };
            log(`  ${ok === item.total ? "✓" : "△"} ${ok}/${item.total} arquivos`);

            if (DELETE_AFTER && ok === item.total) {
                const freed = apagarPaginasLocais(item.pagesDir, BIBLIOTECA, item.mangaId, item.capId);
                state.caps[key].localPurged = true;
                state.caps[key].freedBytes = freed;
                log(`  🗑 local apagado (${(freed / 1024 / 1024).toFixed(1)} MB)`);
            }
        } catch (e) {
            state.stats.fail++;
            state.caps[key] = { done: false, erro: unwrapErrorMessage(e) || e.message, at: new Date().toISOString() };
            log(`  ✗ ${unwrapErrorMessage(e) || e.message}`);
        }

        await saveState();
        if (capDelayMs > 0) await sleep(capDelayMs);
    }

    let next = 0;
    async function worker(client) {
        while (next < fila.length) {
            const i = next++;
            await processarCap(fila[i], i + 1, client);
        }
    }

    await Promise.all(clients.map((c) => worker(c)));

    state.concluidoEm = new Date().toISOString();
    await saveState();
    log(`=== Fim upload: ${state.stats.ok} caps OK | ${state.stats.skip} pulados | ${state.stats.files} arquivos ===`);

    const { spawnSync } = await import("child_process");
    spawnSync(process.execPath, [path.join(__dirname, "..", "build-terabox-chapters-index.mjs")], { cwd: ROOT, stdio: "inherit" });
    spawnSync(process.execPath, [path.join(__dirname, "sync.mjs")], { cwd: ROOT, stdio: "inherit" });
}

main().catch((e) => {
    log(`FATAL: ${unwrapErrorMessage(e) || e.message}`);
    process.exit(1);
});
