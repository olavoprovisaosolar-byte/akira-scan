/**
 * Lock de ficheiro simples (Windows-safe) para escritas JSON concorrentes entre processos.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCK_DIR = path.join(__dirname, "..", "..", "..", "data", "nexustoons", ".locks");

function sleepSync(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
}

function tryAcquire(lockPath, pid, staleMs) {
    try {
        fs.mkdirSync(LOCK_DIR, { recursive: true });
        fs.writeFileSync(lockPath, JSON.stringify({ pid, at: Date.now() }), { flag: "wx" });
        return true;
    } catch (e) {
        if (e.code !== "EEXIST") throw e;
        try {
            const raw = JSON.parse(fs.readFileSync(lockPath, "utf8"));
            if (Date.now() - (raw.at || 0) > staleMs) {
                fs.unlinkSync(lockPath);
                return tryAcquire(lockPath, pid, staleMs);
            }
        } catch {
            try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
            return tryAcquire(lockPath, pid, staleMs);
        }
        return false;
    }
}

function release(lockPath) {
    try {
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch { /* ignore */ }
}

/**
 * @param {string} name
 * @param {() => T} fn
 * @param {{ timeoutMs?: number, staleMs?: number }} [opts]
 * @returns {T}
 * @template T
 */
export function withFileLockSync(name, fn, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 180_000;
    const staleMs = opts.staleMs ?? 300_000;
    const lockPath = path.join(LOCK_DIR, `${name}.lock`);
    const start = Date.now();

    while (!tryAcquire(lockPath, process.pid, staleMs)) {
        if (Date.now() - start > timeoutMs) {
            throw new Error(`Lock timeout (${name}) após ${timeoutMs}ms`);
        }
        sleepSync(40 + Math.floor(Math.random() * 40));
    }

    try {
        return fn();
    } finally {
        release(lockPath);
    }
}
