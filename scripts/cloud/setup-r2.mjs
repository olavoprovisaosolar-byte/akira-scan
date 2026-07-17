/**
 * Cria bucket R2 e envia índice local (migração inicial).
 * Uso: node scripts/cloud/setup-r2.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const BUCKET = process.env.R2_BUCKET || "akira-chapters";
const LOCAL_INDEX = path.join(ROOT, "data", "cloud", "chapters-index.json");

function run(cmd, args) {
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`=== Setup R2: ${BUCKET} ===\n`);

run("npx", ["wrangler", "r2", "bucket", "create", BUCKET]);

if (fs.existsSync(LOCAL_INDEX)) {
    console.log("\nEnviando chapters-index.json local para R2…");
    run("npx", [
        "wrangler", "r2", "object", "put",
        `${BUCKET}/index/chapters-index.json`,
        `--file=${LOCAL_INDEX}`,
        "--content-type=application/json; charset=utf-8"
    ]);
    console.log("Índice inicial enviado.");
} else {
    console.log("\nAviso: data/cloud/chapters-index.json ausente — índice R2 começa vazio.");
}

console.log("\nConfigure no Cloudflare Pages → Settings → Bindings:");
console.log("  R2 bucket: akira-chapters → binding CHAPTERS");
console.log("  Secret: AKIRA_PUBLISH_TOKEN (mesmo valor do bot/CI)");
