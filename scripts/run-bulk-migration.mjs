/**
 * Pipeline completo: limpar fantasmas (global) → bulk import (1+ mangás) → rebuild índice → deploy Cloudflare.
 *
 * Uso:
 *   node scripts/run-bulk-migration.mjs --slug=gye-baeksun-sem-emprego-e-sem-dinheiro
 *   node scripts/run-bulk-migration.mjs --all
 *   npm run migrate:bulk:all
 *   node scripts/run-bulk-migration.mjs --all --no-deploy
 *   node scripts/run-bulk-migration.mjs --all --background
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, isMangaFullyInState } from "../bots/nexustoons-akira/shared/state.js";
import { createAdapter } from "../bots/nexustoons-akira/capture/nexustoons.js";
import { runPostDeployPurge } from "../bots/nexustoons-akira/shared/page-purge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs");
const CONFIG_MANGAS = path.join(ROOT, "bots", "nexustoons-akira", "config.mangas.json");
const BULK_RUN = path.join(ROOT, "bots", "nexustoons-akira", "orchestrator", "bulk-run.mjs");

const args = process.argv.slice(2);
const CI = args.includes("--ci") || process.env.GITHUB_ACTIONS === "true";
const LITE = args.includes("--lite");
const ULTRA = args.includes("--ultra") && !LITE;
const HYPER = args.includes("--hyper") && !LITE;
const TURBO = (args.includes("--turbo") || ULTRA || HYPER) && !LITE;

function applyTurboEnv() {
    process.env.TELEGRA_SKIP = process.env.TELEGRA_SKIP || "1";
    process.env.NEXUSTOONS_DELAY_MS = process.env.NEXUSTOONS_DELAY_MS || "200";
    process.env.NEXUSTOONS_CHAPTER_DELAY_MS = process.env.NEXUSTOONS_CHAPTER_DELAY_MS || "500";
    process.env.PAGE_DOWNLOAD_CONCURRENCY = process.env.PAGE_DOWNLOAD_CONCURRENCY || "8";
    process.env.NEXUSTOONS_PAGE_CONCURRENCY = process.env.NEXUSTOONS_PAGE_CONCURRENCY || "8";
    process.env.TELEGRA_DELAY_MS = process.env.TELEGRA_DELAY_MS || "0";
    process.env.TELEGRA_RETRIES = process.env.TELEGRA_RETRIES || "1";
    process.env.NEXUSTOONS_PW_SETTLE_MS = process.env.NEXUSTOONS_PW_SETTLE_MS || "1200";
    process.env.NEXUSTOONS_PURGE_LOCAL = process.env.NEXUSTOONS_PURGE_LOCAL || "1";
}

function applyUltraEnv() {
    applyTurboEnv();
    process.env.TELEGRA_SKIP = "1";
    process.env.HOSTING_ADAPTER = process.env.HOSTING_ADAPTER || "catbox";
    process.env.NEXUSTOONS_HOSTING_ADAPTER = process.env.NEXUSTOONS_HOSTING_ADAPTER || "catbox";
    process.env.CATBOX_STATIC_FALLBACK = process.env.CATBOX_STATIC_FALLBACK || "false";
    process.env.NEXUSTOONS_DELAY_MS = process.env.NEXUSTOONS_DELAY_MS || "100";
    process.env.NEXUSTOONS_CHAPTER_DELAY_MS = process.env.NEXUSTOONS_CHAPTER_DELAY_MS || "300";
    process.env.NEXUSTOONS_PW_SETTLE_MS = process.env.NEXUSTOONS_PW_SETTLE_MS || "800";
    process.env.PAGE_DOWNLOAD_CONCURRENCY = process.env.PAGE_DOWNLOAD_CONCURRENCY || "12";
    process.env.NEXUSTOONS_PAGE_CONCURRENCY = process.env.NEXUSTOONS_PAGE_CONCURRENCY || "12";
    process.env.NEXUSTOONS_DEFER_CATALOG = "1";
    process.env.NEXUSTOONS_OVERLAP_PIPELINE = "1";
    process.env.SHARP_SKIP_REENCODE = "1";
    process.env.NEXUSTOONS_PW_GOTO_WAIT = "domcontentloaded";
    process.env.NEXUSTOONS_PW_BLOCK_HEAVY = "1";
    process.env.NEXUSTOONS_PURGE_LOCAL = process.env.NEXUSTOONS_PURGE_LOCAL || "1";
}

function applyHyperEnv() {
    applyUltraEnv();
    process.env.NEXUSTOONS_MANGA_PARALLEL = process.env.NEXUSTOONS_MANGA_PARALLEL || "3";
    process.env.NEXUSTOONS_CHAPTER_CONCURRENCY = process.env.NEXUSTOONS_CHAPTER_CONCURRENCY || "2";
    process.env.NEXUSTOONS_DELAY_MS = process.env.NEXUSTOONS_DELAY_MS || "50";
    process.env.NEXUSTOONS_CHAPTER_DELAY_MS = process.env.NEXUSTOONS_CHAPTER_DELAY_MS || "0";
    process.env.NEXUSTOONS_PW_SETTLE_MS = process.env.NEXUSTOONS_PW_SETTLE_MS || "500";
    process.env.PAGE_DOWNLOAD_CONCURRENCY = process.env.PAGE_DOWNLOAD_CONCURRENCY || "20";
    process.env.NEXUSTOONS_PAGE_CONCURRENCY = process.env.NEXUSTOONS_PAGE_CONCURRENCY || "20";
    process.env.NEXUSTOONS_STATE_SAVE_EVERY = process.env.NEXUSTOONS_STATE_SAVE_EVERY || "3";
    process.env.NEXUSTOONS_PURGE_LOCAL = process.env.NEXUSTOONS_PURGE_LOCAL || "1";
}

function applyLiteEnv() {
    process.env.TELEGRA_SKIP = process.env.TELEGRA_SKIP || "1";
    process.env.HOSTING_ADAPTER = process.env.HOSTING_ADAPTER || "catbox";
    process.env.NEXUSTOONS_HOSTING_ADAPTER = process.env.NEXUSTOONS_HOSTING_ADAPTER || "catbox";
    process.env.CATBOX_STATIC_FALLBACK = process.env.CATBOX_STATIC_FALLBACK || "false";
    process.env.NEXUSTOONS_MANGA_PARALLEL = "1";
    process.env.NEXUSTOONS_CHAPTER_CONCURRENCY = "1";
    process.env.NEXUSTOONS_OVERLAP_PIPELINE = "0";
    process.env.PAGE_DOWNLOAD_CONCURRENCY = process.env.PAGE_DOWNLOAD_CONCURRENCY || "6";
    process.env.NEXUSTOONS_PAGE_CONCURRENCY = process.env.NEXUSTOONS_PAGE_CONCURRENCY || "6";
    process.env.NEXUSTOONS_PW_LITE = "1";
    process.env.NEXUSTOONS_PW_HEADLESS = process.env.NEXUSTOONS_PW_HEADLESS || "1";
    process.env.NEXUSTOONS_PW_BLOCK_HEAVY = "1";
    process.env.NEXUSTOONS_DELAY_MS = process.env.NEXUSTOONS_DELAY_MS || "300";
    process.env.NEXUSTOONS_CHAPTER_DELAY_MS = process.env.NEXUSTOONS_CHAPTER_DELAY_MS || "500";
    process.env.NEXUSTOONS_PW_SETTLE_MS = process.env.NEXUSTOONS_PW_SETTLE_MS || "1200";
    process.env.NEXUSTOONS_STATE_SAVE_EVERY = "1";
    process.env.NEXUSTOONS_DEFER_CATALOG = "0";
    process.env.SHARP_SKIP_REENCODE = process.env.SHARP_SKIP_REENCODE || "1";
    process.env.NEXUSTOONS_PURGE_LOCAL = process.env.NEXUSTOONS_PURGE_LOCAL || "1";
}

if (LITE) applyLiteEnv();
else if (HYPER) applyHyperEnv();
else if (ULTRA) applyUltraEnv();
else if (TURBO) applyTurboEnv();

const ALL_MANGAS = args.includes("--all") || !args.some((a) => a.startsWith("--slug=") || a === "--slug");
const SLUG = args.find((a) => a.startsWith("--slug="))?.split("=")[1]
    || (args.includes("--slug") ? args[args.indexOf("--slug") + 1] : null);
const SKIP_DEPLOY = args.includes("--no-deploy");
const DRY_RUN = args.includes("--dry-run");
const BACKGROUND = args.includes("--background");

const logName = ALL_MANGAS ? "migration-all.log" : `migration-${(SLUG || "single").replace(/[^\w-]/g, "_").slice(0, 48)}.log`;
const logPath = path.join(LOG_DIR, logName);
const ALL_LOCK = path.join(LOG_DIR, "migration-all.lock");

function readAllLock() {
    try {
        if (!fs.existsSync(ALL_LOCK)) return null;
        return JSON.parse(fs.readFileSync(ALL_LOCK, "utf8"));
    } catch {
        return null;
    }
}

function isPidAlive(pid) {
    if (!pid || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function activeAllMigrationLock() {
    const lock = readAllLock();
    if (lock?.pid && isPidAlive(lock.pid)) return lock;
    if (fs.existsSync(ALL_LOCK)) {
        try { fs.unlinkSync(ALL_LOCK); } catch { /* ignore */ }
    }
    return null;
}

function refuseIfAllMigrationRunning() {
    const active = activeAllMigrationLock();
    if (!active) return;
    console.error(`Migração --all já em execução (PID ${active.pid}, desde ${active.startedAt || "?"})`);
    console.error(`Lock: ${ALL_LOCK}`);
    process.exit(1);
}

function acquireAllMigrationLock() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    refuseIfAllMigrationRunning();
    const payload = { pid: process.pid, startedAt: new Date().toISOString() };
    try {
        fs.writeFileSync(ALL_LOCK, JSON.stringify(payload, null, 2), { flag: "wx" });
    } catch {
        console.error("Não foi possível adquirir lock migration-all (outra instância --all?)");
        process.exit(1);
    }
    const release = () => {
        try {
            const cur = readAllLock();
            if (cur?.pid === process.pid && fs.existsSync(ALL_LOCK)) fs.unlinkSync(ALL_LOCK);
        } catch { /* ignore */ }
    };
    process.on("exit", release);
    for (const sig of ["SIGINT", "SIGTERM"]) {
        process.on(sig, () => {
            release();
            process.exit(sig === "SIGINT" ? 130 : 143);
        });
    }
}

if (BACKGROUND) {
    if (ALL_MANGAS) refuseIfAllMigrationRunning();
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const childArgs = args.filter((a) => a !== "--background");
    const out = fs.openSync(logPath, "a");
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...childArgs], {
        cwd: ROOT,
        detached: true,
        stdio: ["ignore", out, out],
        env: { ...process.env }
    });
    child.unref();
    const mode = LITE ? " (lite)" : HYPER ? " (hyper)" : ULTRA ? " (ultra)" : TURBO ? " (turbo)" : "";
    console.log(`Migração iniciada em background${mode} (PID ${child.pid})`);
    console.log(`Log: ${logPath}`);
    if (LITE) {
        console.log("Lite: 1 mangá, 1 cap/concorrência, 1 browser, download 6, ~1-1.5GB RAM");
    } else if (HYPER) {
        console.log("Hyper: 3 mangás paralelos, 2 caps/concorrência, download 20, delays mínimos");
    } else if (ULTRA) {
        console.log("Ultra: catbox + sync índice, concurrency 12, overlap capture/hosting, catálogo defer por mangá");
    } else if (TURBO) {
        console.log("Turbo: TELEGRA_SKIP=1, delays reduzidos, download concurrency 8");
    }
    process.exit(0);
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

async function resolveWorkQueue(onProgress) {
    if (!ALL_MANGAS) {
        const slug = SLUG;
        if (!slug) {
            console.error("Uso: node scripts/run-bulk-migration.mjs --slug=SLUG | --all");
            process.exit(1);
        }
        return [{ nexusSlug: slug, title: slug, akiraId: null }];
    }

    const enabled = loadEnabledMangas();
    if (!enabled.length) {
        console.error("Nenhum mangá enabled em config.mangas.json. Execute: node scripts/map-catalog-to-nexustoons.mjs");
        process.exit(1);
    }

    onProgress?.(`Verificando ${enabled.length} mangá(s) enabled…`);
    const state = loadState();
    const capture = createAdapter();
    const queue = [];

    for (let i = 0; i < enabled.length; i++) {
        const m = enabled[i];
        const slug = m.nexusSlug || m.slug;
        let chapters = 0;
        try {
            const detail = await capture.getManga(slug);
            chapters = detail.chapters?.length || 0;
        } catch {
            onProgress?.(`[AVISO] Slug inválido, ignorando: ${slug}`);
            continue;
        }
        if (isMangaFullyInState(state, slug, chapters)) {
            onProgress?.(`[SKIP] ${m.title || slug} — ${chapters} caps já no state`);
            continue;
        }
        queue.push(m);
        if ((i + 1) % 25 === 0) {
            onProgress?.(`Fila: ${queue.length} pendente(s) após ${i + 1}/${enabled.length} verificados`);
        }
    }

    await capture.close();
    return queue;
}

if (ALL_MANGAS && !CI) acquireAllMigrationLock();
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.writeFileSync(logPath, `[${new Date().toISOString()}] Iniciando migração bulk…\n`, "utf8");

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    try {
        fs.appendFileSync(logPath, line + "\n", "utf8");
    } catch {
        /* ignore */
    }
}

function runStep(label, cmd, cmdArgs, opts = {}) {
    log(`▶ ${label}`);
    const r = spawnSync(cmd, cmdArgs, {
        cwd: ROOT,
        encoding: "utf8",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        ...opts
    });
    if (r.stdout) {
        process.stdout.write(r.stdout);
        try { fs.appendFileSync(logPath, r.stdout, "utf8"); } catch { /* ignore */ }
    }
    if (r.stderr) {
        process.stderr.write(r.stderr);
        try { fs.appendFileSync(logPath, r.stderr, "utf8"); } catch { /* ignore */ }
    }
    if (r.status !== 0) {
        log(`✗ Falhou: ${label} (código ${r.status})`);
        process.exit(r.status ?? 1);
    }
    log(`✓ ${label}`);
    return r;
}

const queue = await resolveWorkQueue((msg) => log(msg));

if (!queue.length) {
    log("Nenhum mangá pendente para migrar.");
    process.exit(0);
}

log(`=== Migração bulk: ${ALL_MANGAS ? `${queue.length} mangá(s) na fila` : SLUG}${LITE ? " [LITE]" : HYPER ? " [HYPER]" : ULTRA ? " [ULTRA]" : TURBO ? " [TURBO]" : ""} ===`);
if (LITE) {
    log(`Lite: MANGA_PARALLEL=${process.env.NEXUSTOONS_MANGA_PARALLEL}, CHAPTER_CONCURRENCY=${process.env.NEXUSTOONS_CHAPTER_CONCURRENCY}, PAGE_CONCURRENCY=${process.env.PAGE_DOWNLOAD_CONCURRENCY}, PW_LITE=1`);
} else if (HYPER) {
    log(`Hyper: MANGA_PARALLEL=${process.env.NEXUSTOONS_MANGA_PARALLEL}, CHAPTER_CONCURRENCY=${process.env.NEXUSTOONS_CHAPTER_CONCURRENCY}, PAGE_CONCURRENCY=${process.env.PAGE_DOWNLOAD_CONCURRENCY}`);
}
log(`Log: ${logPath}`);

runStep("Limpar caps fantasma (global)", process.execPath, [
    path.join(__dirname, "clean-ghost-chapters.mjs")
]);

if (!DRY_RUN) {
    const MANGA_PARALLEL = Math.max(1, Number(process.env.NEXUSTOONS_MANGA_PARALLEL || 1));

    function runMangaAsync(slug, title) {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [BULK_RUN, `--slug=${slug}`, "--no-deploy"], {
                cwd: ROOT,
                env: { ...process.env },
                stdio: "inherit"
            });
            child.on("error", reject);
            child.on("close", (code) => {
                if (code !== 0) reject(new Error(`Bulk import '${title}' falhou (código ${code})`));
                else resolve();
            });
        });
    }

    async function runMangaPool(items, parallelism) {
        let nextIdx = 0;
        let failErr = null;

        async function worker(workerId) {
            while (!failErr) {
                const i = nextIdx++;
                if (i >= items.length) break;
                const m = items[i];
                const slug = m.nexusSlug || m.slug;
                const title = m.title || slug;
                log(`[MANGÁ ${i + 1}/${items.length}] Worker ${workerId}: '${title}' | slug=${slug}`);
                try {
                    await runMangaAsync(slug, title);
                    log(`✓ Bulk import: ${title}`);
                } catch (e) {
                    failErr = e;
                    log(`✗ Falhou: ${title} — ${e.message}`);
                    break;
                }
            }
        }

        const workers = [];
        for (let w = 0; w < Math.min(parallelism, items.length); w++) {
            workers.push(worker(w + 1));
        }
        await Promise.all(workers);
        if (failErr) throw failErr;
    }

    if (MANGA_PARALLEL > 1) {
        log(`▶ Import bulk paralelo (${MANGA_PARALLEL} workers)`);
        try {
            await runMangaPool(queue, MANGA_PARALLEL);
        } catch (e) {
            log(`✗ Import bulk paralelo falhou: ${e.message}`);
            process.exit(1);
        }
        log(`✓ Import bulk paralelo concluído (${queue.length} mangás)`);
    } else {
        for (let i = 0; i < queue.length; i++) {
            const m = queue[i];
            const slug = m.nexusSlug || m.slug;
            const title = m.title || slug;
            log(`[MANGÁ ${i + 1}/${queue.length}] Processando '${title}' | slug=${slug}`);

            runStep(
                `Bulk import: ${title}`,
                process.execPath,
                [BULK_RUN, `--slug=${slug}`, "--no-deploy"],
                { stdio: "inherit", env: { ...process.env } }
            );
        }
    }

    runStep("Rebuild catalogo-index", process.execPath, [
        path.join(__dirname, "build-catalog-index.mjs")
    ]);

    runStep("Prepare Cloudflare deploy", process.execPath, [
        path.join(__dirname, "prepare-cloudflare-deploy.mjs")
    ]);

    if (!SKIP_DEPLOY) {
        const project = process.env.CF_PAGES_PROJECT || "akira-scan";
        const branch = process.env.CF_PAGES_BRANCH || "main";
        runStep("Wrangler Pages deploy (final)", "npx", [
            "wrangler", "pages", "deploy", "deploy-cloudflare",
            "--project-name", project,
            "--branch", branch,
            "--commit-dirty=true"
        ], { shell: true, stdio: "inherit" });

        const purgeResult = runPostDeployPurge();
        log(`Purge local pós-deploy: ${purgeResult.purged} cap(s), ${purgeResult.files} arquivo(s)`);
    }
}

log("=== Migração concluída ===");
console.log(`\nMonitor: ${logPath}`);
