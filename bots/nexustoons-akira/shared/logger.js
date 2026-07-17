import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
const LOG_DIR = path.join(ROOT, "logs");

let logFile = path.join(LOG_DIR, "nexustoons-bot.log");

export function setLogFile(name) {
    logFile = path.join(LOG_DIR, name);
}

function write(prefix, msg, meta) {
    const line = `[${prefix}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`;
    console.log(line);
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(logFile, line + "\n", "utf8");
    } catch { /* ignore */ }
}

export const log = {
    info: (msg, meta) => write("INFO", msg, meta),
    warn: (msg, meta) => write("WARN", msg, meta),
    error: (msg, meta) => write("ERRO", msg, meta),
    /** Erros fatais do pipeline bulk — prefixo [CRÍTICO] */
    critical: (msg, meta) => write("CRÍTICO", msg, meta),
    success: (msg, meta) => write("SUCESSO", msg, meta),
    /** Prefixo customizado: [NEXUSTOONS], [TELEGRA.PH], [AKIRA API], etc. */
    tag: (prefix, msg, meta) => write(prefix, msg, meta),
    debug: (msg, meta) => {
        if (process.env.NEXUSTOONS_DEBUG === "1") write("DEBUG", msg, meta);
    }
};
