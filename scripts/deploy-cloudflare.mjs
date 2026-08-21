/**
 * Build + deploy para Cloudflare Pages (site estático + API cloud-chapters).
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PROJECT = process.env.CF_PAGES_PROJECT || "akira-scan";
const BRANCH = process.env.CF_PAGES_BRANCH || "main";
const MIN_NODE_MAJOR = 22;

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

const major = Number.parseInt(process.versions.node.split(".")[0], 10);
if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    console.error(
        `Wrangler 4 exige Node.js >= ${MIN_NODE_MAJOR}. Atual: ${process.versions.node}`
    );
    process.exit(1);
}

const wranglerJs = path.join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
if (!fs.existsSync(wranglerJs)) {
    console.error("wrangler não encontrado em node_modules. Rode: npm ci");
    process.exit(1);
}

console.log("=== Deploy Cloudflare Pages ===\n");
console.log(`Node ${process.versions.node}`);

run(process.execPath, [path.join(__dirname, "verify-cloud-data.mjs")], { shell: false });
run(process.execPath, [path.join(__dirname, "prepare-cloudflare-deploy.mjs")], { shell: false });

console.log(`\nPublicando em Cloudflare Pages (projeto: ${PROJECT})…`);
run(process.execPath, [
    wranglerJs,
    "pages",
    "deploy",
    "deploy-cloudflare",
    "--project-name",
    PROJECT,
    "--branch",
    BRANCH,
    "--commit-dirty=true"
]);

console.log("\nDeploy concluído.");
