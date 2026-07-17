/**
 * Build + deploy para Cloudflare Pages (site estático + API cloud-chapters).
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROJECT = process.env.CF_PAGES_PROJECT || "akira-scan";
const BRANCH = process.env.CF_PAGES_BRANCH || "main";

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        cwd: ROOT,
        encoding: "utf8",
        shell: false,
        stdio: "inherit",
        ...opts
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("=== Deploy Cloudflare Pages ===\n");

run(process.execPath, [path.join(__dirname, "prepare-cloudflare-deploy.mjs")], { shell: false });

console.log(`\nPublicando em Cloudflare Pages (projeto: ${PROJECT})…`);
run("npx", [
    "wrangler", "pages", "deploy", "deploy-cloudflare",
    "--project-name", PROJECT,
    "--branch", BRANCH,
    "--commit-dirty=true"
], { shell: true });

console.log("\nDeploy concluído.");
