/**
 * Deploy em lote Cloudflare Pages — executado uma vez após todos os capítulos.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
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
    if (r.status !== 0) {
        throw new Error(`comando falhou (${cmd}): exit ${r.status ?? 1}`);
    }
}

export async function runBatchDeploy() {
    log.info("=== Batch deploy Cloudflare Pages ===");

    run(process.execPath, [path.join(ROOT, "scripts", "prepare-cloudflare-deploy.mjs")]);

    log.info(`Publicando em Cloudflare Pages (projeto: ${PROJECT})…`);
    run("npx", [
        "wrangler", "pages", "deploy", "deploy-cloudflare",
        "--project-name", PROJECT,
        "--branch", BRANCH,
        "--commit-dirty=true"
    ], { shell: true });

    log.success("Batch deploy concluído");

    const { runPostDeployPurge } = await import("./page-purge.js");
    runPostDeployPurge();
}
