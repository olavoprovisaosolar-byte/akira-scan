/**
 * Backup COMPLETO ToonLivre — metadados, capas, capítulos e páginas.
 *
 * Estrutura gerada (por obra):
 *   data/toonlivre-backup/obras/{mangaId}/
 *     ├── metadados.json
 *     ├── capa.webp
 *     └── capitulos/
 *         └── capitulo-035/
 *             ├── meta.json
 *             ├── pagina-001.webp
 *             └── ...
 *
 * Espelho compatível com import AkiraScan:
 *   data/toonlivre-backup/mangas/{mangaId}/chapters/{capId}/pages/
 *   Biblioteca_Mangas/{mangaId}/{capId}/
 *
 * Uso:
 *   node scripts/backup-toonlivre-complete.mjs              # retoma se existir state
 *   node scripts/backup-toonlivre-complete.mjs --fresh      # reinicia state
 *   node scripts/backup-toonlivre-complete.mjs --limit=3    # teste (N obras)
 *   node scripts/backup-toonlivre-complete.mjs --manga=obra-69466adb
 *
 * Variáveis:
 *   BACKUP_DELAY_MS=600        delay entre capítulos
 *   BACKUP_USE_PLAYWRIGHT=1    (padrão) usa Playwright para páginas
 *   BACKUP_PAGE_CONCURRENCY=8  downloads de imagens em paralelo
 *   BACKUP_PW_SETTLE_MS=1200   espera após abrir capítulo no browser
 *   BACKUP_PW_GOTO_WAIT=domcontentloaded
 *   BACKUP_SHARD_INDEX=0 BACKUP_SHARD_TOTAL=4  — 4 instâncias paralelas
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
    pesquisarMangas,
    obterMangaPorSlug,
    obterToken,
    TOONLIVRE_BASE
} from "../netlify/functions/toonlivre-client.mjs";
import { capEnviadoTerabox } from "./terabox/upload-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(ROOT, ".playwright-browsers");
}
const BACKUP = path.join(ROOT, "data", "toonlivre-backup");
const MANGAS_DIR = path.join(BACKUP, "mangas");
const OBRAS_DIR = path.join(BACKUP, "obras");
const BIBLIOTECA = path.join(ROOT, "Biblioteca_Mangas");

const SHARD_INDEX = Number(process.env.BACKUP_SHARD_INDEX || 0);
const SHARD_TOTAL = Math.max(1, Number(process.env.BACKUP_SHARD_TOTAL || 1));

const STATE_FILE = path.join(
    BACKUP,
    SHARD_TOTAL > 1 ? `complete-state-shard-${SHARD_INDEX}.json` : "complete-state.json"
);
const FAILURES_FILE = path.join(BACKUP, "complete-failures.jsonl");
const REPORT_FILE = path.join(BACKUP, "complete-report.json");
const LOG_FILE = path.join(ROOT, "logs", "backup-complete.log");

const FRESH = process.argv.includes("--fresh");
const RESUME = !FRESH;
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);
const MANGA_FILTER = process.argv.find((a) => a.startsWith("--manga="))?.split("=")[1] || "";
const DELAY_MS = Number(process.env.BACKUP_DELAY_MS || 600);
const USE_PW = process.env.BACKUP_USE_PLAYWRIGHT !== "0";
const MAX_FAIL_STREAK = Number(process.env.BACKUP_MAX_FAIL_STREAK || 3);
const PAGE_CONCURRENCY = Math.max(1, Number(process.env.BACKUP_PAGE_CONCURRENCY || 6));
const PW_SETTLE_MS = Number(process.env.BACKUP_PW_SETTLE_MS || 1500);
const PW_GOTO_WAIT = process.env.BACKUP_PW_GOTO_WAIT || "domcontentloaded";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shardKey(mangaId) {
    let h = 0;
    for (let i = 0; i < mangaId.length; i++) h = (h + mangaId.charCodeAt(i)) % SHARD_TOTAL;
    return h;
}

async function mapPool(items, concurrency, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const idx = next++;
            results[idx] = await fn(items[idx], idx);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    return results;
}

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

function extFromUrl(url, contentType = "") {
    if (contentType.includes("webp")) return ".webp";
    if (contentType.includes("png")) return ".png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
    const m = String(url).match(/\.(webp|png|jpe?g|gif)(\?|$)/i);
    return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : ".webp";
}

function capNumeroLabel(n) {
    const s = String(n);
    if (s.includes(".")) return s.padStart(5, "0");
    return String(Math.floor(Number(n))).padStart(3, "0");
}

function capsFromMeta(meta) {
    const list = meta.chapters || meta.capitulos || meta.recentChapters || [];
    return list
        .map((c) => ({
            id: c.id,
            numero: Number(c.number ?? c.numero ?? c.chapterNumber) || 0,
            titulo: c.title || c.titulo || "",
            pageCount: c.pageCount ?? c.page_count ?? c.paginas ?? 0
        }))
        .filter((c) => c.id && c.numero > 0)
        .sort((a, b) => a.numero - b.numero);
}

function paginasExistentes(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => /\.(webp|jpg|jpeg|png)$/i.test(f));
}

function lerState() {
    if (RESUME && fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        } catch { /* novo */ }
    }
    return {
        fase: "listagem",
        mangaIds: [],
        mangaIndex: 0,
        mangas: {},
        stats: {
            obrasTotal: 0,
            obrasOk: 0,
            obrasFail: 0,
            capitulosTotal: 0,
            capitulosOk: 0,
            capitulosFail: 0,
            paginasOk: 0,
            paginasFail: 0,
            bytesDownloaded: 0
        },
        falhas: [],
        iniciadoEm: new Date().toISOString()
    };
}

function guardarState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function listarTodosMangas() {
    const ids = new Set();
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
        log(`  Listagem API página ${page}/${totalPages}`);
        const data = await pesquisarMangas({ page, limit: 48, sortBy: "updatedAt", sortOrder: "desc" });
        const lista = data.mangas || [];
        totalPages = data.pagination?.totalPages || page;
        for (const m of lista) {
            const id = m.id || m.uploadSlug;
            if (id) ids.add(id);
        }
        if (!lista.length) break;
        page++;
        await sleep(DELAY_MS);
    }

    const local = fs.existsSync(MANGAS_DIR)
        ? fs.readdirSync(MANGAS_DIR).filter((d) => fs.existsSync(path.join(MANGAS_DIR, d, "meta.json")))
        : [];
    for (const id of local) ids.add(id);

    return [...ids];
}

async function downloadFile(url, destPath, referer = TOONLIVRE_BASE, headers = {}) {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 200) {
        return fs.statSync(destPath).size;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const token = await obterToken();
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
            Referer: referer,
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            [token.header]: token.value,
            ...headers
        },
        redirect: "follow"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return buf.length;
}

function extrairPaginasDeHtml(html) {
    const match = html.match(/"pages"\s*:\s*(\[[\s\S]*?\])/);
    if (match) {
        try {
            const parsed = JSON.parse(match[1].replace(/\\"/g, '"'));
            if (parsed.length >= 1) return parsed.map((u) => (typeof u === "string" ? u : u?.url)).filter(Boolean);
        } catch { /* continua */ }
    }
    return [...html.matchAll(/https?:\/\/[^"'\\\s]+\.(?:webp|jpg|jpeg|png)(?:\?[^"'\\\s]*)?/gi)]
        .map((m) => m[0])
        .filter((u) => /toonlivre|tlycdn|cloudfront|r2\.cloudflarestorage/i.test(u));
}

class PlaywrightSession {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.warmed = false;
    }

    async init() {
        if (this.browser) return;
        const { chromium } = await import("playwright");
        const launchOpts = {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        };
        try {
            this.browser = await chromium.launch(launchOpts);
        } catch {
            log("  [PW] Chromium bundled ausente — tentando Chrome do sistema...");
            this.browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
        }
        this.context = await this.browser.newContext({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            locale: "pt-BR",
            viewport: { width: 1280, height: 900 }
        });
        this.page = await this.context.newPage();
    }

    async warmup() {
        await this.init();
        if (this.warmed) return;
        await this.page.goto(`${TOONLIVRE_BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await this.page.waitForTimeout(2500);
        this.warmed = true;
    }

    async fetchChapterPages(mangaId, chapterId, numeroCap) {
        await this.warmup();
        let apiPages = null;

        const handler = async (res) => {
            const u = res.url();
            if (!u.includes("/api/mangas/") || !u.includes("/chapters/")) return;
            try {
                const json = await res.json();
                if (json.pages?.length) apiPages = json.pages;
            } catch { /* ignore */ }
        };
        this.page.on("response", handler);

        const chapterUrl = `${TOONLIVRE_BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(String(numeroCap))}`;
        try {
            await this.page.goto(chapterUrl, { waitUntil: PW_GOTO_WAIT, timeout: 60000 });
            if (PW_SETTLE_MS > 0) await this.page.waitForTimeout(PW_SETTLE_MS);
        } catch (e) {
            log(`    [PW] goto parcial: ${e.message}`);
        } finally {
            this.page.off("response", handler);
        }

        if (apiPages?.length) {
            return apiPages.map((p) => (typeof p === "string" ? p : p?.url)).filter(Boolean);
        }

        const html = await this.page.content();
        const fromHtml = extrairPaginasDeHtml(html);
        if (fromHtml.length >= 1) return fromHtml;

        const domUrls = await this.page.evaluate(() =>
            [...document.querySelectorAll("img, picture source")]
                .map((el) => el.src || el.getAttribute("data-src") || el.getAttribute("srcset")?.split(" ")[0])
                .filter((u) => u && /^https?:\/\//.test(u) && /\.(webp|jpg|jpeg|png)/i.test(u))
        );
        const unique = [...new Set(domUrls)].filter((u) => !/logo|avatar|banner|404|widget/i.test(u));
        return unique.length >= 1 ? unique : null;
    }

    async close() {
        if (this.browser) await this.browser.close();
        this.browser = null;
    }
}

async function fetchPagesFallback(_mangaId, _chapterId, _numeroCap) {
    return null;
}

function espelharParaBiblioteca(mangaId, capId, srcPagesDir) {
    const dest = path.join(BIBLIOTECA, mangaId, capId);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of paginasExistentes(srcPagesDir)) {
        const from = path.join(srcPagesDir, f);
        const to = path.join(dest, f);
        if (!fs.existsSync(to)) fs.copyFileSync(from, to);
    }
}

async function baixarCapitulo(mangaId, cap, dirs, state, pw) {
    const { legacyPagesDir, obraCapDir, capId } = dirs;
    const entry = state.mangas[mangaId]?.chapters?.[capId];

    if (capEnviadoTerabox(mangaId, capId)) {
        if (!state.mangas[mangaId].chapters) state.mangas[mangaId].chapters = {};
        state.mangas[mangaId].chapters[capId] = {
            done: true,
            pages: entry?.pages || 0,
            terabox: true,
            skippedLocal: true
        };
        state.stats.capitulosOk++;
        return true;
    }

    if (entry?.done && paginasExistentes(legacyPagesDir).length > 0) {
        state.stats.capitulosOk++;
        state.stats.paginasOk += entry.pages || paginasExistentes(legacyPagesDir).length;
        return true;
    }

    if (entry?.done && !paginasExistentes(legacyPagesDir).length) {
        /* já baixado antes; local apagado — não repetir se está no Terabox */
        return capEnviadoTerabox(mangaId, capId);
    }

    let pageUrls = null;
    if (USE_PW && pw) {
        try {
            pageUrls = await pw.fetchChapterPages(mangaId, capId, cap.numero);
        } catch (e) {
            log(`    [PW] falha cap.${cap.numero}: ${e.message}`);
        }
    }

    if (!pageUrls?.length) {
        pageUrls = await fetchPagesFallback(mangaId, capId, cap.numero);
    }

    if (!pageUrls?.length) {
        state.stats.capitulosFail++;
        if (!state.mangas[mangaId].chapters) state.mangas[mangaId].chapters = {};
        state.mangas[mangaId].chapters[capId] = { done: false, pages: 0, erro: "sem páginas" };
        logFailure({ tipo: "capitulo", mangaId, capId, numero: cap.numero, motivo: "sem páginas" });
        state.falhas.push({ mangaId, capId, numero: cap.numero, motivo: "sem páginas" });
        return false;
    }

    fs.mkdirSync(legacyPagesDir, { recursive: true });
    fs.mkdirSync(obraCapDir, { recursive: true });
    const referer = `${TOONLIVRE_BASE}/${mangaId}/${cap.numero}`;
    let pagesOk = 0;
    let bytes = 0;

    const jobs = pageUrls
        .map((url, i) => ({ url, i }))
        .filter(({ url }) => url && String(url).startsWith("http"));

    await mapPool(jobs, PAGE_CONCURRENCY, async ({ url, i }) => {
        const ext = extFromUrl(url);
        const legacyFile = `${String(i + 1).padStart(3, "0")}${ext}`;
        const obraFile = `pagina-${String(i + 1).padStart(3, "0")}${ext}`;
        const legacyPath = path.join(legacyPagesDir, legacyFile);
        try {
            const n = await downloadFile(url, legacyPath, referer);
            bytes += n;
            const obraPath = path.join(obraCapDir, obraFile);
            if (!fs.existsSync(obraPath)) fs.copyFileSync(legacyPath, obraPath);
            pagesOk++;
        } catch (e) {
            state.stats.paginasFail++;
            logFailure({ tipo: "pagina", mangaId, capId, pagina: i + 1, motivo: e.message });
        }
    });

    if (pagesOk === 0) {
        state.stats.capitulosFail++;
        state.mangas[mangaId].chapters[capId] = { done: false, pages: 0, erro: "download falhou" };
        return false;
    }

    const capMeta = {
        id: capId,
        numero: cap.numero,
        titulo: cap.titulo,
        pages: pagesOk,
        backedUpAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(path.dirname(legacyPagesDir), "meta.json"), JSON.stringify(capMeta, null, 2));
    fs.writeFileSync(path.join(obraCapDir, "meta.json"), JSON.stringify(capMeta, null, 2));

    espelharParaBiblioteca(mangaId, capId, legacyPagesDir);

    state.stats.capitulosOk++;
    state.stats.paginasOk += pagesOk;
    state.stats.bytesDownloaded += bytes;
    state.mangas[mangaId].chapters[capId] = { done: true, pages: pagesOk };
    log(`    ✓ cap.${cap.numero} — ${pagesOk} págs`);
    return true;
}

function obraCompleta(mangaId, entry) {
    const metaPath = path.join(MANGAS_DIR, mangaId, "meta.json");
    if (!fs.existsSync(metaPath)) return false;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const caps = capsFromMeta(meta);
    if (!caps.length) return !!entry?.done;
    return caps.every((c) => {
        const pagesDir = path.join(MANGAS_DIR, mangaId, "chapters", c.id, "pages");
        if (paginasExistentes(pagesDir).length > 0) return true;
        return capEnviadoTerabox(mangaId, c.id);
    });
}

async function backupObra(mangaId, state, pw) {
    const mangaDir = path.join(MANGAS_DIR, mangaId);
    const obraDir = path.join(OBRAS_DIR, mangaId);
    fs.mkdirSync(mangaDir, { recursive: true });
    fs.mkdirSync(obraDir, { recursive: true });

    if (!state.mangas[mangaId]) state.mangas[mangaId] = { chapters: {} };

    let raw;
    const metaPath = path.join(mangaDir, "meta.json");
    try {
        if (fs.existsSync(metaPath)) {
            raw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        } else {
            raw = await obterMangaPorSlug(mangaId);
            fs.writeFileSync(metaPath, JSON.stringify(raw, null, 2), "utf8");
        }
        fs.writeFileSync(path.join(obraDir, "metadados.json"), JSON.stringify(raw, null, 2), "utf8");
    } catch (e) {
        state.stats.obrasFail++;
        logFailure({ tipo: "obra", mangaId, motivo: e.message });
        return;
    }

    const coverUrl = raw.coverUrl || raw.cover || raw.capa || "";
    const coverDestLegacy = path.join(mangaDir, `cover${extFromUrl(coverUrl)}`);
    const coverDestObra = path.join(obraDir, `capa${extFromUrl(coverUrl)}`);
    if (coverUrl) {
        try {
            if (!fs.existsSync(coverDestLegacy)) {
                await downloadFile(coverUrl, coverDestLegacy, `${TOONLIVRE_BASE}/${mangaId}`);
            }
            if (!fs.existsSync(coverDestObra)) {
                fs.copyFileSync(coverDestLegacy, coverDestObra);
            }
        } catch (e) {
            logFailure({ tipo: "capa", mangaId, motivo: e.message });
        }
    }

    const caps = capsFromMeta(raw);
    const prevTotal = state.mangas[mangaId]?.capsListed;
    if (!prevTotal) {
        state.stats.capitulosTotal += caps.length;
        state.mangas[mangaId].capsListed = caps.length;
    }
    let failStreak = 0;

    for (const cap of caps) {
        if (failStreak >= MAX_FAIL_STREAK) {
            log(`    ⏭ ${mangaId} — ${failStreak} falhas seguidas, restantes marcados pendente`);
            break;
        }

        const capId = cap.id;
        const legacyCapDir = path.join(mangaDir, "chapters", capId);
        const legacyPagesDir = path.join(legacyCapDir, "pages");
        const obraCapDir = path.join(obraDir, "capitulos", `capitulo-${capNumeroLabel(cap.numero)}`);

        const ok = await baixarCapitulo(mangaId, cap, { legacyPagesDir, obraCapDir, capId }, state, pw);
        if (ok) failStreak = 0;
        else failStreak++;

        guardarState(state);
        await sleep(DELAY_MS);
    }

    state.stats.obrasOk++;
    state.mangas[mangaId].done = obraCompleta(mangaId, state.mangas[mangaId]);
}

function contarBackupDisco() {
    let obras = 0;
    let caps = 0;
    let paginas = 0;
    if (!fs.existsSync(MANGAS_DIR)) return { obras, caps, paginas };
    for (const mangaId of fs.readdirSync(MANGAS_DIR)) {
        const capsDir = path.join(MANGAS_DIR, mangaId, "chapters");
        if (!fs.existsSync(capsDir)) continue;
        let mangaTemCap = false;
        for (const capId of fs.readdirSync(capsDir)) {
            const pagesDir = path.join(capsDir, capId, "pages");
            const n = paginasExistentes(pagesDir).length;
            if (n > 0) {
                caps++;
                paginas += n;
                mangaTemCap = true;
            }
        }
        if (mangaTemCap) obras++;
    }
    return { obras, caps, paginas };
}

function gerarRelatorio(state) {
    const disco = contarBackupDisco();
    const obrasCompletas = Object.entries(state.mangas).filter(([id]) => obraCompleta(id, state.mangas[id])).length;
    const capsOk = state.stats.capitulosOk;
    const capsFail = state.stats.capitulosFail;
    const capsTotal = state.stats.capitulosTotal;

    const report = {
        geradoEm: new Date().toISOString(),
        iniciadoEm: state.iniciadoEm,
        obras: {
            total: state.stats.obrasTotal,
            processadas: obrasCompletas,
            ok: state.stats.obrasOk,
            fail: state.stats.obrasFail
        },
        capitulos: {
            total: state.stats.capitulosTotal,
            baixados: disco.caps,
            falhas: Math.max(0, state.stats.capitulosTotal - disco.caps),
            percentual: state.stats.capitulosTotal
                ? ((disco.caps / state.stats.capitulosTotal) * 100).toFixed(2) + "%"
                : "0%"
        },
        paginas: {
            baixadas: disco.paginas,
            falhas: state.stats.paginasFail
        },
        bytesDownloaded: state.stats.bytesDownloaded,
        espacoMB: (state.stats.bytesDownloaded / 1024 / 1024).toFixed(2),
        falhas: state.falhas.slice(-500),
        falhasArquivo: FAILURES_FILE,
        estrutura: {
            obras: OBRAS_DIR,
            mangas: MANGAS_DIR,
            biblioteca: BIBLIOTECA
        },
        prontoImportacao: disco.caps > 0 && disco.caps >= state.stats.capitulosTotal * 0.99,
        comandoImport: "npm run rebuild:backup"
    };

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
    return report;
}

async function main() {
    log("=== Backup COMPLETO ToonLivre — início ===");
    fs.mkdirSync(BACKUP, { recursive: true });
    fs.mkdirSync(OBRAS_DIR, { recursive: true });
    fs.mkdirSync(BIBLIOTECA, { recursive: true });

    if (USE_PW) {
        log("Pré-requisito: npx playwright install chromium  (ou Chrome instalado no sistema)");
    }

    const state = lerState();
    if (state.fase === "concluido" && state.mangaIndex < (state.mangaIds?.length || 0)) {
        state.fase = "download";
        log(`Retomando backup incompleto (${state.mangaIndex}/${state.mangaIds.length} obras)`);
    }
    const pw = USE_PW ? new PlaywrightSession() : null;

    try {
        if (state.fase === "listagem" || !state.mangaIds?.length) {
            log("Fase 1: listagem do catálogo...");
            state.mangaIds = await listarTodosMangas();
            state.stats.obrasTotal = state.mangaIds.length;
            state.fase = "download";
            guardarState(state);
            log(`  ${state.mangaIds.length} obras encontradas`);
        }

        let fila = state.mangaIds;
        if (MANGA_FILTER) fila = fila.filter((id) => id === MANGA_FILTER);
        else if (!process.argv.includes("--all")) {
            const resumeFrom = state.mangaIndex || 0;
            fila = fila.slice(resumeFrom).filter((id) => !obraCompleta(id, state.mangas[id]));
            log(`  ${fila.length} obras pendentes (retomando após índice ${resumeFrom})`);
        }
        if (LIMIT > 0) fila = fila.slice(0, LIMIT);
        if (SHARD_TOTAL > 1) {
            const antes = fila.length;
            fila = fila.filter((id) => shardKey(id) === SHARD_INDEX);
            log(`  Shard ${SHARD_INDEX + 1}/${SHARD_TOTAL}: ${fila.length}/${antes} obras`);
        }

        const startIndex = 0;

        log(`Fase 2: download completo (${fila.length} obras)...`);
        for (let i = startIndex; i < fila.length; i++) {
            const mangaId = fila[i];
            const m = state.mangas[mangaId];
            if (m?.done && obraCompleta(mangaId, m)) continue;

            log(`  [${i + 1}/${fila.length}] ${mangaId}`);
            if (m?.done) {
                delete state.mangas[mangaId].done;
            }
            await backupObra(mangaId, state, pw);
            if (!MANGA_FILTER) {
                const idx = state.mangaIds.indexOf(mangaId);
                if (idx >= 0) state.mangaIndex = Math.max(state.mangaIndex || 0, idx + 1);
            }
            guardarState(state);
            await sleep(DELAY_MS);
        }

        state.fase = "download";
        guardarState(state);

        const report = gerarRelatorio(state);
        log(`=== Concluído: ${report.obras.processadas}/${report.obras.total} obras | ${report.capitulos.baixados}/${report.capitulos.total} caps | ${report.paginas.baixadas} págs ===`);
        log(`Relatório: ${REPORT_FILE}`);

        if (report.capitulos.baixados > 0) {
            log("▶ Importando para AkiraScan...");
            spawnSync(process.execPath, [path.join(__dirname, "import-toonlivre-backup.mjs")], {
                cwd: ROOT,
                stdio: "inherit"
            });
        }
    } finally {
        if (pw) await pw.close();
    }
}

main().catch((e) => {
    log(`FATAL: ${e.message}`);
    process.exit(1);
});
