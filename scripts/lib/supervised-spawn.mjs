/**
 * Spawn com watchdog: se o filho não emitir stdout/stderr, mata e devolve stalled.
 */
import { spawn } from "node:child_process";

const DEFAULT_STALL_MS = Number(process.env.UPLOAD_STALL_MS || 8 * 60 * 1000);

export function spawnWithWatchdog(cmd, args, {
    cwd,
    env = process.env,
    stallMs = DEFAULT_STALL_MS,
    label = pathLabel(cmd, args)
} = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"]
        });
        let lastActivity = Date.now();
        let stalled = false;
        let settled = false;
        const finish = (value, err) => {
            if (settled) return;
            settled = true;
            clearInterval(timer);
            if (err) reject(err);
            else resolve(value);
        };

        const bump = (buf, stream) => {
            lastActivity = Date.now();
            stream.write(buf);
        };

        child.stdout?.on("data", (d) => bump(d, process.stdout));
        child.stderr?.on("data", (d) => bump(d, process.stderr));

        const pollMs = Math.min(15_000, Math.max(250, Math.floor(stallMs / 3)));
        const timer = setInterval(() => {
            if (Date.now() - lastActivity < stallMs) return;
            stalled = true;
            clearInterval(timer);
            console.error(`[watchdog] ${label}: sem log há ${Math.round(stallMs / 1000)}s — matando PID ${child.pid}`);
            try { child.kill("SIGKILL"); } catch { /* ignore */ }
            setTimeout(() => {
                finish({ code: 1, signal: "SIGKILL", stalled: true, pid: child.pid });
            }, 2000);
        }, pollMs);

        child.on("error", (err) => finish(null, err));
        child.on("close", (code, signal) => {
            finish({ code: code ?? (stalled ? 1 : 0), signal, stalled, pid: child.pid });
        });
    });
}

export async function runWithRestarts(spawnOnce, {
    maxRestarts = Number(process.env.UPLOAD_MAX_RESTARTS || 50),
    backoffMs = Number(process.env.UPLOAD_RESTART_BACKOFF_MS || 15_000),
    isDone = (result) => result.code === 0 || result.code === 2
} = {}) {
    let attempt = 0;
    let last = { code: 1 };

    while (attempt < maxRestarts) {
        attempt++;
        last = await spawnOnce(attempt);
        if (isDone(last)) return last;
        const wait = Math.min(backoffMs * Math.min(attempt, 8), 120_000);
        console.error(
            `[supervisor] tentativa ${attempt}/${maxRestarts} saiu (code=${last.code}` +
            `${last.stalled ? ", stalled" : ""}) — retoma em ${Math.round(wait / 1000)}s`
        );
        await new Promise((r) => setTimeout(r, wait));
    }
    return last;
}

function pathLabel(cmd, args) {
    const last = [...(args || [])].reverse().find((a) => typeof a === "string" && a.includes(".")) || cmd;
    return String(last).split(/[\\/]/).pop();
}
