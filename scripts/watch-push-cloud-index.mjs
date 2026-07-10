/**
 * Enquanto o upload corre: rebuild do índice + commit/push leve a cada N minutos.
 * Uso: node scripts/watch-push-cloud-index.mjs [--every=300]
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const everySec = Math.max(120, Number(process.argv.find((a) => a.startsWith("--every="))?.split("=")[1] || 300));

const author = {
    GIT_AUTHOR_NAME: "olavoprovisaosolar-byte",
    GIT_AUTHOR_EMAIL: "olavoprovisaosolar-byte@users.noreply.github.com",
    GIT_COMMITTER_NAME: "olavoprovisaosolar-byte",
    GIT_COMMITTER_EMAIL: "olavoprovisaosolar-byte@users.noreply.github.com"
};

function run(cmd, args) {
    return spawnSync(cmd, args, {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, ...author }
    });
}

function tick() {
    console.log(`[watch-push] rebuild @ ${new Date().toISOString()}`);
    run(process.execPath, [path.join(__dirname, "build-terabox-chapters-index.mjs")]);
    run(process.execPath, [path.join(__dirname, "build-catalog-index.mjs")]);

    run("git", ["add", "data/cloud/chapters-index.json", "data/terabox/chapters-index.json", "data/catalogo-index.json"]);
    const st = run("git", ["diff", "--cached", "--quiet"]);
    if (st.status === 0) {
        console.log("[watch-push] sem mudanças no índice");
        return;
    }
    const msg = `Atualiza índice cloud (upload TBATE em progresso).`;
    const c = run("git", ["commit", "-m", msg]);
    if (c.status !== 0) {
        console.log("[watch-push] commit:", (c.stderr || c.stdout || "").trim());
        return;
    }
    const p = run("git", ["push", "origin", "HEAD"]);
    console.log("[watch-push] push:", p.status === 0 ? "ok" : (p.stderr || p.stdout || "").trim());
}

console.log(`[watch-push] a cada ${everySec}s`);
tick();
setInterval(tick, everySec * 1000);
