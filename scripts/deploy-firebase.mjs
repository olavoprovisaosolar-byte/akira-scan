/**
 * Build + pacote + deploy Firebase Hosting (akirascan).
 * Requer: npx firebase login  (uma vez)
 *
 * Uso: npm run deploy:firebase
 */
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { prepareFirebaseDeploy } from "./prepare-firebase-deploy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function run(cmd, args, label) {
    console.log(`\n▶ ${label}`);
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true });
    if (r.status !== 0) process.exit(r.status || 1);
}

console.log("=== Deploy AkiraScan → Firebase Hosting ===");

run("npm", ["run", "rebuild:backup"], "Reimportar catálogo + índice");
run("npm", ["run", "build"], "Build TypeScript");
run("node", ["scripts/build-catalog-index.mjs"], "Índice leve");

const { out, sizeMB } = prepareFirebaseDeploy();

const login = spawnSync("npx", ["firebase", "projects:list"], { cwd: ROOT, encoding: "utf8", shell: true });
if (login.status !== 0 || /Error|not logged in|Failed/i.test(login.stderr || "")) {
    console.error("\n❌ Faça login: npx firebase login");
    process.exit(1);
}

console.log(`\n▶ Deploy Firebase (${sizeMB.toFixed(1)} MB)...`);
const deploy = spawnSync(
    "npx",
    ["firebase", "deploy", "--only", "hosting,firestore", "--project", "akirascan"],
    { cwd: ROOT, stdio: "inherit", shell: true }
);

if (deploy.status !== 0) process.exit(deploy.status || 1);

console.log("\n✓ Deploy Firebase concluído.");
console.log("  https://akirascan.web.app/");
console.log("  https://akirascan.firebaseapp.com/");
