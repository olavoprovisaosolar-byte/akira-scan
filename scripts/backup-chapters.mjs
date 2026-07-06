/**
 * Backup de capítulos (páginas) → data/toonlivre-backup/ + Biblioteca_Mangas
 *
 * Uso:
 *   node scripts/backup-chapters.mjs           # continua de onde parou
 *   node scripts/backup-chapters.mjs --fresh   # reinicia fila de capítulos
 *   node scripts/backup-chapters.mjs --limit 5 # só N mangás (teste)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { obterOuCachearCapitulo } from "./chapter-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BACKUP = path.join(ROOT, "data", "toonlivre-backup");
const MANGAS_DIR = path.join(BACKUP, "mangas");
const BIBLIOTECA = path.join(ROOT, "Biblioteca_Mangas");
const STATE_FILE = path.join(BACKUP, "chapters-state.json");
const LOG_FILE = path.join(ROOT, "logs", "backup-chapters.log");

const FRESH = process.argv.includes("--fresh");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);
const MANGA_FILTER = process.argv.find((a) => a.startsWith("--manga="))?.split("=")[1] || "";
const MAX_FAIL_STREAK = Number(process.env.BACKUP_MAX_FAIL_STREAK || 5);
const SKIP_COMPLETE = !process.argv.includes("--all");
const DELAY_MS = Number(process.env.BACKUP_DELAY_MS || 500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
}

function lerState() {
    if (!FRESH && fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        } catch { /* novo */ }
    }
    return {
        iniciadoEm: new Date().toISOString(),
        mangasProcessados: 0,
        capsOk: 0,
        capsFail: 0,
        paginasOk: 0,
        capsDone: {},
        falhas: []
    };
}

function guardarState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function capsFromMeta(meta) {
    const list = meta.chapters || meta.capitulos || meta.recentChapters || [];
    return list
        .map((c) => ({
            id: c.id,
            numero: Number(c.number ?? c.numero ?? c.chapterNumber) || 0
        }))
        .filter((c) => c.id && c.numero > 0)
        .sort((a, b) => a.numero - b.numero);
}

function mangaJaCompleto(mangaId) {
    const metaPath = path.join(MANGAS_DIR, mangaId, "meta.json");
    if (!fs.existsSync(metaPath)) return false;
    const caps = capsFromMeta(JSON.parse(fs.readFileSync(metaPath, "utf8")));
    if (!caps.length) return false;
    return caps.every((c) => capJaBaixado(mangaId, c.id));
}

function capJaBaixado(mangaId, capId) {
    const pagesDir = path.join(MANGAS_DIR, mangaId, "chapters", capId, "pages");
    if (!fs.existsSync(pagesDir)) return false;
    return fs.readdirSync(pagesDir).some((f) => /\.(webp|jpg|jpeg|png)$/i.test(f));
}

function copiarCapParaBiblioteca(mangaId, capId) {
    const src = path.join(MANGAS_DIR, mangaId, "chapters", capId, "pages");
    if (!fs.existsSync(src)) return 0;
    const dest = path.join(BIBLIOTECA, mangaId, capId);
    fs.mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(src)) {
        if (!/\.(webp|jpg|jpeg|png)$/i.test(f)) continue;
        const from = path.join(src, f);
        const to = path.join(dest, f);
        if (!fs.existsSync(to)) fs.copyFileSync(from, to);
        n++;
    }
    return n;
}

function gravarCapMeta(mangaId, cap, pagesCount) {
    const capDir = path.join(MANGAS_DIR, mangaId, "chapters", cap.id);
    fs.mkdirSync(capDir, { recursive: true });
    fs.writeFileSync(
        path.join(capDir, "meta.json"),
        JSON.stringify({
            id: cap.id,
            mangaId,
            numero: cap.numero,
            pagesLocal: pagesCount,
            pagesBackedUp: pagesCount > 0,
            urlExterna: `https://toonlivre.net/${encodeURIComponent(mangaId)}/${encodeURIComponent(String(cap.numero))}`,
            syncedAt: new Date().toISOString()
        }, null, 2)
    );
}

async function backupCapitulosManga(mangaId, state) {
    const metaPath = path.join(MANGAS_DIR, mangaId, "meta.json");
    if (!fs.existsSync(metaPath)) return;

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const caps = capsFromMeta(meta);
    if (!caps.length) return;

    const doneSet = new Set(state.capsDone[mangaId] || []);
    let mangaPages = 0;
    let failStreak = 0;

    for (const cap of caps) {
        if (doneSet.has(cap.id)) continue;

        if (capJaBaixado(mangaId, cap.id)) {
            const n = copiarCapParaBiblioteca(mangaId, cap.id);
            mangaPages += n;
            state.paginasOk += n;
            state.capsOk++;
            doneSet.add(cap.id);
            gravarCapMeta(mangaId, cap, n);
            failStreak = 0;
            continue;
        }

        if (failStreak >= MAX_FAIL_STREAK) {
            log(`    ⏭ ${mangaId} — ${failStreak} falhas seguidas, próximo mangá`);
            break;
        }

        try {
            const pages = await obterOuCachearCapitulo(ROOT, mangaId, cap.id, String(cap.numero));
            if (pages?.length) {
                const n = copiarCapParaBiblioteca(mangaId, cap.id);
                mangaPages += n;
                state.paginasOk += n;
                state.capsOk++;
                doneSet.add(cap.id);
                gravarCapMeta(mangaId, cap, n);
                failStreak = 0;
                log(`    ✓ ${mangaId} cap.${cap.numero} — ${pages.length} págs`);
            } else {
                state.capsFail++;
                failStreak++;
                gravarCapMeta(mangaId, cap, 0);
                state.falhas.push({ mangaId, capId: cap.id, numero: cap.numero, motivo: "sem páginas" });
                log(`    ✗ ${mangaId} cap.${cap.numero} — sem páginas`);
            }
        } catch (e) {
            state.capsFail++;
            failStreak++;
            gravarCapMeta(mangaId, cap, 0);
            state.falhas.push({ mangaId, capId: cap.id, numero: cap.numero, motivo: e.message });
            log(`    ✗ ${mangaId} cap.${cap.numero} — ${e.message}`);
        }

        state.capsDone[mangaId] = [...doneSet];
        guardarState(state);
        await sleep(DELAY_MS);
    }

    return mangaPages;
}

async function main() {
    log("=== Backup de capítulos — início ===");
    fs.mkdirSync(BIBLIOTECA, { recursive: true });

    const state = lerState();
    const mangaIds = fs.readdirSync(MANGAS_DIR).filter((d) =>
        fs.existsSync(path.join(MANGAS_DIR, d, "meta.json"))
    );

    let fila = mangaIds;
    if (MANGA_FILTER) fila = fila.filter((id) => id === MANGA_FILTER);
    if (LIMIT > 0) fila = fila.slice(0, LIMIT);
    if (SKIP_COMPLETE) fila = fila.filter((id) => !mangaJaCompleto(id));
    log(`  ${fila.length} mangás na fila (${mangaIds.length} total no backup)`);

    let i = 0;
    for (const mangaId of fila) {
        i++;
        log(`  [${i}/${fila.length}] ${mangaId}`);
        await backupCapitulosManga(mangaId, state);
        state.mangasProcessados = i;
        guardarState(state);
    }

    state.concluidoEm = new Date().toISOString();
    guardarState(state);

    log(`=== Concluído: ${state.capsOk} capítulos OK | ${state.capsFail} falhas | ${state.paginasOk} páginas ===`);
    log("  Execute: node scripts/import-toonlivre-backup.mjs  (atualizar catálogo)");
}

main().catch((e) => {
    log(`FATAL: ${e.message}`);
    process.exit(1);
});
