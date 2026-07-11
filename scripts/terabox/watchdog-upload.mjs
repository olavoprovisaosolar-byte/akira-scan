/**
 * Vigia o upload Terabox e reinicia se o processo morrer.
 * Uso: node scripts/terabox/watchdog-upload.mjs
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const STATE_FILE = path.join(ROOT, "data", "terabox", "upload-state.json");
const LOG_FILE = path.join(ROOT, "logs", "terabox-upload-run.out.log");
const WATCH_LOG = path.join(ROOT, "logs", "watchdog-upload.log");

const MODES = ["upload-max.mjs", "upload-x10.mjs", "upload-turbo.mjs"];
const CHECK_MS = 45_000;
const STALE_MS = 180_000;

let child = null;
let modeIdx = 0;
let crashes = 0;
let lastDone = 0;
let lastLogSize = 0;
let lastLogMtime = 0;

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    try {
        fs.mkdirSync(path.dirname(WATCH_LOG), { recursive: true });
        fs.appendFileSync(WATCH_LOG, line + "\n", "utf8");
    } catch { /* ignore */ }
}

function stats() {
    try {
        const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
        const caps = Object.values(s.caps || {});
        const done = caps.filter((c) => c.done).length;
        return { done, total: caps.length };
    } catch {
        return { done: 0, total: 0 };
    }
}

function logActivity() {
    try {
        const st = fs.statSync(LOG_FILE);
        return { size: st.size, mtime: st.mtimeMs };
    } catch {
        return { size: 0, mtime: 0 };
    }
}

function startUpload() {
    const script = MODES[modeIdx];
    log(`Iniciando ${script} (modo ${modeIdx + 1}/${MODES.length})`);
    child = spawn(process.execPath, [path.join(__dirname, script)], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env }
    });

    const append = (chunk) => {
        try {
            fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
            fs.appendFileSync(LOG_FILE, chunk);
        } catch { /* ignore */ }
    };

    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    child.on("exit", (code) => {
        log(`Upload terminou (exit=${code ?? "?"})`);
        child = null;
        crashes++;
        if (crashes >= 2 && modeIdx < MODES.length - 1) {
            modeIdx++;
            crashes = 0;
            log(`Muitos crashes — desce para ${MODES[modeIdx]}`);
        }
        setTimeout(startUpload, 5000);
    });
}

function tick() {
    const { done, total } = stats();
    const activity = logActivity();
    const running = child && !child.killed;
    const progressed = done > lastDone;
    const logMoved = activity.size > lastLogSize || activity.mtime > lastLogMtime;
    const stale = Date.now() - activity.mtime > STALE_MS;

    if (progressed) {
        const delta = done - lastDone;
        log(`OK ${done}/${total} (+${delta}) | modo ${MODES[modeIdx]}`);
        lastDone = done;
        crashes = 0;
    }

    lastLogSize = activity.size;
    lastLogMtime = activity.mtime;

    if (!running) {
        log("Processo ausente — reiniciando...");
        startUpload();
        return;
    }

    if (stale && !logMoved) {
        log(`Sem atividade há ${Math.round(STALE_MS / 1000)}s — reiniciando...`);
        child.kill("SIGTERM");
        setTimeout(() => {
            if (child) child.kill("SIGKILL");
        }, 8000);
    }
}

log("Watchdog ativo — monitora upload a cada 45s");
const initial = stats();
lastDone = initial.done;
log(`Estado inicial: ${initial.done}/${initial.total} done`);

if (!child) startUpload();
setInterval(tick, CHECK_MS);
