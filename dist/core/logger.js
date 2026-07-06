/** Logger centralizado — erros de scraping, render e fetch. */
const buffer = [];
const MAX_BUFFER = 200;
function push(level, tag, message, meta) {
    const entry = {
        level,
        tag,
        message,
        meta,
        ts: new Date().toISOString()
    };
    buffer.push(entry);
    if (buffer.length > MAX_BUFFER)
        buffer.shift();
    const line = `[${entry.ts}] [${tag}] ${message}`;
    if (level === "error")
        console.error(line, meta ?? "");
    else if (level === "warn")
        console.warn(line, meta ?? "");
    else if (level === "debug")
        console.debug(line, meta ?? "");
    else
        console.log(line, meta ?? "");
}
export const logger = {
    debug: (tag, message, meta) => push("debug", tag, message, meta),
    info: (tag, message, meta) => push("info", tag, message, meta),
    warn: (tag, message, meta) => push("warn", tag, message, meta),
    error: (tag, message, meta) => push("error", tag, message, meta),
    scraperError: (site, detail, meta) => push("error", "ScraperError", `[${site}] ${detail}`, meta),
    getRecent: (limit = 50) => buffer.slice(-limit),
    clear: () => { buffer.length = 0; }
};
