/**
 * Deploy lean Netlify package (cloud API only).
 * Loads NETLIFY_AUTH_TOKEN from .env without printing secrets.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PKG = path.join(ROOT, "deploy-netlify-min");

dotenv.config({ path: path.join(ROOT, ".env") });

const token = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN || "";
const siteId = process.env.NETLIFY_SITE_ID || "4e2bd27c-c2d2-4ff8-ac3c-1dbb677c6985";

if (!token) {
    console.error("NETLIFY_AUTH_TOKEN ausente no .env — skip deploy Netlify.");
    process.exit(2);
}

// Sync function + index into package
fs.copyFileSync(
    path.join(ROOT, "netlify/functions/cloud-chapters.js"),
    path.join(PKG, "netlify/functions/cloud-chapters.js")
);
const idxSrc = path.join(ROOT, "data/cloud/chapters-index.json");
if (fs.existsSync(idxSrc)) {
    fs.mkdirSync(path.join(PKG, "data/cloud"), { recursive: true });
    fs.copyFileSync(idxSrc, path.join(PKG, "data/cloud/chapters-index.json"));
}

const env = { ...process.env, NETLIFY_AUTH_TOKEN: token, NETLIFY_SITE_ID: siteId };
console.log("Deploying cloud API to Netlify site", siteId, "…");
const r = spawnSync(
    "npx",
    ["--yes", "netlify-cli", "deploy", "--prod", "--dir=.", "--functions=netlify/functions", `--site=${siteId}`],
    { cwd: PKG, env, encoding: "utf8", shell: true, timeout: 300000 }
);
if (r.stdout) console.log(r.stdout.slice(-2000));
if (r.stderr) console.error(r.stderr.slice(-1500));
process.exit(r.status ?? 1);
