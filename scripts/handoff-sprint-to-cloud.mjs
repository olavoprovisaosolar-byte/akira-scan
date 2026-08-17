#!/usr/bin/env node
/**
 * Para sprint local → push checkpoint → dispara GitHub Actions (PC pode desligar).
 *
 * Uso:
 *   node scripts/handoff-sprint-to-cloud.mjs --push
 *   node scripts/handoff-sprint-to-cloud.mjs --push --force
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DO_PUSH = args.includes("--push");
const FORCE = args.includes("--force");
const WORKFLOW = "nexus-sprint-1day-cloud.yml";

function run(cmd, cmdArgs, opts = {}) {
    const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", ...opts });
    return r;
}

console.log("\n=== Handoff sprint → nuvem (GitHub Actions) ===\n");

// 1. Parar migração local
run(process.execPath, [
    path.join(ROOT, "scripts", "handoff-migration-to-cloud.mjs"),
    ...(FORCE ? ["--force"] : [])
], { stdio: "inherit" });

// 2. Parar sprint órfão (PID do run-1day-sprint background)
for (const name of ["sprint-1day.log", "migration-all.lock"]) {
    const p = path.join(ROOT, "logs", name);
    if (name.endsWith(".lock") && fs.existsSync(p)) {
        try {
            const lock = JSON.parse(fs.readFileSync(p, "utf8"));
            if (lock?.pid) {
                console.log(`Encerrando PID sprint ${lock.pid}…`);
                run(process.platform === "win32" ? "taskkill" : "kill", 
                    process.platform === "win32" ? ["/PID", String(lock.pid), "/T", "/F"] : ["-9", String(lock.pid)]);
            }
        } catch { /* ignore */ }
    }
}

const checkpointFiles = [
    "data/nexustoons/state.json",
    "data/nexustoons/manifest.json",
    "data/cloud/chapters-index.json",
    "data/catalogo-index.json",
    ".github/workflows/nexus-sprint-1day-cloud.yml",
    "scripts/check-sprint-pending.mjs",
    "scripts/run-1day-sprint.mjs",
    "scripts/handoff-sprint-to-cloud.mjs",
    "bots/nexustoons-akira/shared/nexus-catalog.js",
    "scripts/run-bulk-migration.mjs",
    "bots/nexustoons-akira/shared/state.js",
    "bots/nexustoons-akira/index.js",
    "bots/nexustoons-akira/orchestrator/bulk-run.mjs"
].filter((f) => fs.existsSync(path.join(ROOT, f)));

run("git", ["add", ...checkpointFiles], { stdio: "inherit" });

const status = run("git", ["status", "--short"]);
if (status.stdout?.trim()) {
    console.log("\nCommit handoff…");
    run("git", ["commit", "-m", "chore(sprint): handoff local to cloud checkpoint"], { stdio: "inherit" });
} else {
    console.log("\nNada novo para commit (checkpoint já commitado).");
}

if (!DO_PUSH) {
    console.log(`
Próximo passo:
  node scripts/handoff-sprint-to-cloud.mjs --push

Ou manualmente:
  git push
  gh workflow run ${WORKFLOW} -f deploy=false -f manga_parallel=2
`);
    process.exit(0);
}

console.log("\nPush para origin…");
const push = run("git", ["push"], { stdio: "inherit" });
if (push.status !== 0) {
    console.error("Push falhou — verifique credenciais git.");
    process.exit(1);
}

console.log("\nDisparando workflow na nuvem…");
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout?.trim() || "main";
const wf = run("gh", [
    "workflow", "run", WORKFLOW,
    "--ref", branch,
    "-f", "deploy=false",
    "-f", "manga_parallel=2"
], { stdio: "inherit" });

if (wf.status !== 0) {
    console.log(`
Push OK, mas gh CLI falhou. Dispare manualmente:
  GitHub → Actions → "Nexus Sprint 1 Day (Cloud)" → Run workflow
`);
    process.exit(wf.status ?? 1);
}

console.log(`
✓ Sprint na nuvem iniciado. Pode desligar o PC.

Acompanhar:
  gh run list --workflow=${WORKFLOW}
  https://github.com/olavoprovisaosolar-byte/akira-scan/actions

Secrets necessários (Settings → Secrets → Actions):
  AKIRA_PUBLISH_TOKEN  — caps aparecem no site em tempo real
  CLOUDFLARE_API_TOKEN — opcional (deploy)
`);
