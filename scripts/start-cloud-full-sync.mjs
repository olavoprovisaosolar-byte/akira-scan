#!/usr/bin/env node
/**
 * Dispara backfill completo na nuvem (GitHub Actions) — corre sozinho até terminar.
 *
 * Uso:
 *   node scripts/start-cloud-full-sync.mjs --push
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "olavoprovisaosolar-byte/akira-scan";
const WORKFLOW = "nexus-full-sync-cloud.yml";
const args = process.argv.slice(2);
const DO_PUSH = args.includes("--push");

function gitHubToken() {
    if (process.env.GH_TOKEN?.trim()) return process.env.GH_TOKEN.trim();
    const r = spawnSync("git", ["credential", "fill"], {
        cwd: ROOT,
        input: "protocol=https\nhost=github.com\n\n",
        encoding: "utf8"
    });
    return r.stdout?.match(/^password=(.+)$/m)?.[1]?.trim() || "";
}

function run(cmd, cmdArgs, opts = {}) {
    return spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", ...opts });
}

const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() || "main";

console.log("\n=== Iniciar backfill completo na nuvem ===\n");

const files = [
    ".github/workflows/nexus-full-sync-cloud.yml",
    "scripts/check-full-sync-pending.mjs",
    "scripts/start-cloud-full-sync.mjs"
].filter((f) => fs.existsSync(path.join(ROOT, f)));

run("git", ["add", ...files], { stdio: "inherit" });
const st = spawnSync("git", ["status", "--short"], { cwd: ROOT, encoding: "utf8" });
if (st.stdout?.trim()) {
    run("git", ["-c", "user.name=Akira Scan CDN", "-c", "user.email=41898282+olavoprovisaosolar-byte@users.noreply.github.com", "commit", "-m", "feat(cloud): full sync workflow auto-retrigger"], { stdio: "inherit" });
}

if (DO_PUSH) {
    const push = run("git", ["push", "origin", branch]);
    if (push.status !== 0) process.exit(1);
}

const ghToken = gitHubToken();
if (!ghToken) {
    console.error("Sem token GitHub. Dispare manualmente em Actions → Nexus Full Sync (Cloud)");
    process.exit(1);
}

const wf = spawnSync("gh", [
    "workflow", "run", WORKFLOW,
    "--repo", REPO,
    "--ref", branch,
    "-f", "deploy=false",
    "-f", "manga_parallel=2"
], { env: { ...process.env, GH_TOKEN: ghToken }, stdio: "inherit" });

if (wf.status !== 0) process.exit(wf.status ?? 1);

console.log(`
✓ Workflow disparado na nuvem (branch: ${branch})
  Corre sozinho até baixar tudo — re-dispara a cada ~6h se faltar conteúdo.

Acompanhar:
  gh run list --workflow=${WORKFLOW} --repo ${REPO}
  https://github.com/${REPO}/actions
`);
