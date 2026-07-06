/** Logger centralizado — erros de scraping, render e fetch. */
export type LogLevel = "debug" | "info" | "warn" | "error";
export interface LogEntry {
    level: LogLevel;
    tag: string;
    message: string;
    meta?: Record<string, unknown>;
    ts: string;
}
export declare const logger: {
    debug: (tag: string, message: string, meta?: Record<string, unknown>) => void;
    info: (tag: string, message: string, meta?: Record<string, unknown>) => void;
    warn: (tag: string, message: string, meta?: Record<string, unknown>) => void;
    error: (tag: string, message: string, meta?: Record<string, unknown>) => void;
    scraperError: (site: string, detail: string, meta?: Record<string, unknown>) => void;
    getRecent: (limit?: number) => LogEntry[];
    clear: () => void;
};
