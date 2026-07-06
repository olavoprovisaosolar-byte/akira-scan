/** Logger centralizado — erros de scraping, render e fetch. */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    meta?: Record<string, unknown>;
    ts: string;
}

const buffer: LogEntry[] = [];
const MAX_BUFFER = 200;

function push(level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>) {
    const entry: LogEntry = {
        level,
        tag,
        message,
        meta,
        ts: new Date().toISOString()
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER) buffer.shift();

    const line = `[${entry.ts}] [${tag}] ${message}`;
    if (level === "error") console.error(line, meta ?? "");
    else if (level === "warn") console.warn(line, meta ?? "");
    else if (level === "debug") console.debug(line, meta ?? "");
    else console.log(line, meta ?? "");
}

export const logger = {
    debug: (tag: string, message: string, meta?: Record<string, unknown>) =>
        push("debug", tag, message, meta),
    info: (tag: string, message: string, meta?: Record<string, unknown>) =>
        push("info", tag, message, meta),
    warn: (tag: string, message: string, meta?: Record<string, unknown>) =>
        push("warn", tag, message, meta),
    error: (tag: string, message: string, meta?: Record<string, unknown>) =>
        push("error", tag, message, meta),
    scraperError: (site: string, detail: string, meta?: Record<string, unknown>) =>
        push("error", "ScraperError", `[${site}] ${detail}`, meta),
    getRecent: (limit = 50) => buffer.slice(-limit),
    clear: () => { buffer.length = 0; }
};
