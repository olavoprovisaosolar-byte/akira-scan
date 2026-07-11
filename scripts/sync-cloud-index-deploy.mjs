/**
 * Copia chapters-index atualizado para pacotes Netlify de deploy.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "data", "cloud", "chapters-index.json");
const SRC_TB = path.join(ROOT, "data", "terabox", "chapters-index.json");

const TARGETS = [
    "deploy-netlify-min/data/cloud/chapters-index.json",
    "deploy-netlify-cloud/data/cloud/chapters-index.json",
    "deploy-netlify-min/data/terabox/chapters-index.json",
    "deploy-netlify-cloud/data/terabox/chapters-index.json"
];

if (!fs.existsSync(SRC)) {
    console.error("Índice ausente — rode npm run terabox:build-index primeiro.");
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
for (const rel of TARGETS) {
    const dest = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const from = rel.includes("/terabox/") && fs.existsSync(SRC_TB) ? SRC_TB : SRC;
    fs.copyFileSync(from, dest);
}
console.log(`Índice sincronizado (${data.total} caps) → ${TARGETS.length} destinos`);
