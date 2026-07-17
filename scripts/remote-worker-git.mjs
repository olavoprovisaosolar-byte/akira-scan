#!/usr/bin/env node
/**
 * Sync git de checkpoint entre PCs (pull / push).
 *
 * Uso:
 *   node scripts/remote-worker-git.mjs pull
 *   node scripts/remote-worker-git.mjs push
 *   node scripts/remote-worker-git.mjs push --label=manual
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const CHECKPOINT_PATHS = [
    "data/nexustoons/state.json",
    "data/nexustoons/manifest.json",
    "data/catalogo.json",
    "data/catalogo-index.json",
    "data/cloud/chapters-index.json"
];

const args = process.argv.slice(2);
const cmd = args[0];
const labelArg = args.find((a) => a.startsWith("--label="));
const label = labelArg?.split("=")[1] || "manual";

function gitEnv() {
    const name = process.env.GIT_AUTHOR_NAME || process.env.REMOTE_WORKER_NAME || "akira-remote-worker";
    const email = process.env.GIT_AUTHOR_EMAIL || "akira-remote-worker@local";
    return {
        ...process.env,
        GIT_AUTHOR_NAME: name,
        GIT_AUTHOR_EMAIL: email,
        GIT_COMMITTER_NAME: name,
        GIT_COMMITTER_EMAIL: email
    };
}

function git(argsList, opts = {}) {
    const r = spawnSync("git", argsList, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: opts.silent ? "pipe" : "inherit",
        env: gitEnv()
    });
    return r;
}

function currentBranch() {
    const r = git(["rev-parse", "--abbrev-ref", "HEAD"], { silent: true });
    return (r.stdout || "main").trim() || "main";
}

function pull() {
    console.log("[remote-git] git pull --rebase…");
    const branch = currentBranch();
    const r = git(["pull", "--rebase", "origin", branch]);
    if (r.status !== 0) {
        console.error("[remote-git] pull falhou — resolva conflitos manualmente.");
        process.exit(1);
    }
    const caps = countProcessed();
    console.log(`[remote-git] OK — state.json: ${caps} cap(s) processado(s).`);
}

function push() {
    const existing = CHECKPOINT_PATHS.filter((p) => fs.existsSync(path.join(ROOT, p)));
    if (!existing.length) {
        console.warn("[remote-git] Nenhum arquivo de checkpoint encontrado.");
        return;
    }

    git(["add", ...existing]);
    const staged = git(["diff", "--staged", "--quiet"], { silent: true });
    if (staged.status === 0) {
        console.log("[remote-git] Nada novo para commitar.");
    } else {
        const ts = new Date().toISOString().slice(0, 16);
        const msg = `bot(remote): checkpoint ${label} ${ts}`;
        const commit = git(["commit", "-m", msg]);
        if (commit.status !== 0) {
            console.error("[remote-git] commit falhou.");
            process.exit(1);
        }
        console.log(`[remote-git] Commit: ${msg}`);
    }

    const branch = currentBranch();
    console.log(`[remote-git] git push origin ${branch}…`);
    const pushR = git(["push", "origin", branch]);
    if (pushR.status !== 0) {
        console.error("[remote-git] push falhou — verifique credenciais git.");
        process.exit(1);
    }
    console.log("[remote-git] Push OK.");
}

function countProcessed() {
    const statePath = path.join(ROOT, "data", "nexustoons", "state.json");
    if (!fs.existsSync(statePath)) return 0;
    try {
        const st = JSON.parse(fs.readFileSync(statePath, "utf8"));
        return Object.keys(st.processed || {}).length;
    } catch {
        return 0;
    }
}

if (cmd === "pull") pull();
else if (cmd === "push") push();
else {
    console.error("Uso: node scripts/remote-worker-git.mjs pull|push [--label=nome]");
    process.exit(1);
}
