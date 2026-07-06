/**
 * Prepara e publica no Netlify (akira-scan.netlify.app).
 * Requer: npx netlify login  (uma vez)
 *
 * Uso: node scripts/deploy-prod.mjs
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function run(cmd, args, label) {
    console.log(`\n▶ ${label}`);
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true });
    if (r.status !== 0) process.exit(r.status || 1);
}

console.log("=== Deploy AkiraScan → Netlify ===");

run("npm", ["run", "rebuild:backup"], "Reimportar catálogo + índice");
run("npm", ["run", "build"], "Build TypeScript");
run("node", ["scripts/build-catalog-index.mjs"], "Índice leve");

const status = spawnSync("npx", ["netlify", "status"], { cwd: ROOT, encoding: "utf8", shell: true });
if (status.status !== 0 || /Not logged in|Authentication/i.test(status.stdout + status.stderr)) {
    console.error("\n❌ Faça login: npx netlify login");
    console.error("   Depois vincule: npx netlify link");
    process.exit(1);
}

run("node", ["scripts/prepare-netlify-deploy.mjs"], "Preparar pacote + deploy produção");

console.log("\n✓ Deploy concluído. Teste:");
console.log("  https://akira-scan.netlify.app/");
console.log("  https://akira-scan.netlify.app/manhwa.html?id=obra-69466adb");
console.log("  https://akira-scan.netlify.app/leitor.html?id=obra-69466adb&n=1&ch=cap-d501f6c4-01");
