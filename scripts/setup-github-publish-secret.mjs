#!/usr/bin/env node
/**
 * Grava AKIRA_PUBLISH_TOKEN (e opcionalmente CLOUDFLARE_API_TOKEN) nos GitHub Actions secrets.
 * Usa git credential / GH_TOKEN — não imprime valores.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.GITHUB_REPO || "olavoprovisaosolar-byte/akira-scan";

function readEnvKey(key) {
    const v = process.env[key];
    if (v?.trim()) return v.trim();
    for (const f of [".env", ".dev.vars"]) {
        const p = path.join(ROOT, f);
        if (!fs.existsSync(p)) continue;
        for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
            if (line.startsWith(`${key}=`)) {
                return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
            }
        }
    }
    return "";
}

function gitHubToken() {
    if (process.env.GH_TOKEN?.trim()) return process.env.GH_TOKEN.trim();
    if (process.env.GITHUB_TOKEN?.trim()) return process.env.GITHUB_TOKEN.trim();
    const r = spawnSync("git", ["credential", "fill"], {
        cwd: ROOT,
        input: "protocol=https\nhost=github.com\n\n",
        encoding: "utf8"
    });
    const m = r.stdout?.match(/^password=(.+)$/m);
    return m?.[1]?.trim() || "";
}

function setSecret(name, value, ghToken) {
    if (!value) {
        console.log(`[skip] ${name} — vazio no .env`);
        return false;
    }
    const r = spawnSync(
        "gh",
        ["secret", "set", name, "--repo", REPO, "--body", value],
        { env: { ...process.env, GH_TOKEN: ghToken }, encoding: "utf8" }
    );
    if (r.status === 0) {
        console.log(`[ok] ${name} → GitHub Actions secrets (${REPO})`);
        return true;
    }
    console.error(`[erro] ${name}:`, r.stderr?.trim() || r.stdout?.trim() || `exit ${r.status}`);
    return false;
}

const ghToken = gitHubToken();
if (!ghToken) {
    console.error("Sem token GitHub. Rode: gh auth login");
    process.exit(1);
}

const publish = readEnvKey("AKIRA_PUBLISH_TOKEN");
const cf = readEnvKey("CLOUDFLARE_API_TOKEN");

let ok = setSecret("AKIRA_PUBLISH_TOKEN", publish, ghToken);
if (cf) ok = setSecret("CLOUDFLARE_API_TOKEN", cf, ghToken) && ok;

process.exit(ok ? 0 : 1);
