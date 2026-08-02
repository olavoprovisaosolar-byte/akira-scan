#!/usr/bin/env node
/**
 * Gera sitemap.xml a partir do catálogo.
 * Uso: node scripts/build-sitemap.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SITE_URL || "https://akira-scan.pages.dev";
const INDEX = path.join(ROOT, "data", "catalogo-index.json");
const OUT = path.join(ROOT, "sitemap.xml");

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const catalog = JSON.parse(fs.readFileSync(INDEX, "utf8"));
const mangas = catalog.mangas || [];

const urls = [
    { loc: `${BASE}/`, pri: "1.0" },
    { loc: `${BASE}/biblioteca.html`, pri: "0.9" },
    { loc: `${BASE}/biblioteca.html?sort=recentes`, pri: "0.8" },
    { loc: `${BASE}/biblioteca.html?sort=popular`, pri: "0.8" },
    { loc: `${BASE}/atualizacoes.html`, pri: "0.9" },
    { loc: `${BASE}/perfil.html`, pri: "0.6" }
];

for (const m of mangas) {
    if (!m?.id) continue;
    urls.push({
        loc: `${BASE}/index.html?view=details&id=${encodeURIComponent(m.id)}`,
        pri: "0.7"
    });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><priority>${u.pri}</priority></url>`).join("\n")}
</urlset>
`;

fs.writeFileSync(OUT, xml, "utf8");
console.log(`Sitemap: ${urls.length} URLs → ${OUT}`);
