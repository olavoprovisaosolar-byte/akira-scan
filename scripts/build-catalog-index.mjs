/**
 * Gera data/catalogo-index.json — catálogo leve para a home (~500KB vs 15MB).
 * Uso: node scripts/build-catalog-index.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const FULL = path.join(ROOT, "data", "catalogo.json");
const INDEX = path.join(ROOT, "data", "catalogo-index.json");

function fixMediaPath(p) {
    if (!p) return "";
    if (p.startsWith("/backup/mangas/")) {
        return `data/toonlivre-backup/mangas/${p.slice("/backup/mangas/".length)}`;
    }
    if (p.startsWith("/data/")) return p.slice(1);
    return p.replace(/^\//, "");
}

function slimManga(m) {
    const caps = (m.capitulos || []).slice(0, 3).map((c) => ({
        id: c.id,
        numero: c.numero ?? c.number,
        publicadoEm: c.publicadoEm || c.publishedAt,
        novo: c.novo || false
    }));
    const totalCaps = m.capitulos?.length || caps.length;
    if (totalCaps > caps.length && caps[0]) {
        caps.unshift({
            id: m.capitulos[0].id,
            numero: m.capitulos[0].numero ?? m.capitulos[0].number,
            publicadoEm: m.capitulos[0].publicadoEm,
            novo: m.capitulos[0].novo || false
        });
    }

    return {
        id: m.id,
        titulo: m.titulo || m.title,
        sinopse: (m.sinopse || m.description || "").slice(0, 280),
        autor: m.autor || m.author || "",
        generos: m.generos || m.genres || [],
        status: m.status || "Em lançamento",
        capa: fixMediaPath(m.capa || m.coverUrl || ""),
        banner: fixMediaPath(m.banner || m.capa || ""),
        popularidade: m.popularidade ?? m.popularity ?? 50,
        capitulos: caps.length ? caps : [{ id: "cap-1", numero: 1, publicadoEm: m.atualizadoEm }],
        totalCapitulos: totalCaps,
        atualizadoEm: m.atualizadoEm || caps[0]?.publicadoEm,
        origem: m.origem || "biblioteca"
    };
}

const data = JSON.parse(fs.readFileSync(FULL, "utf8"));
const mangas = (data.mangas || []).map(slimManga);

fs.writeFileSync(INDEX, JSON.stringify({
    fonte: "catalogo-index",
    atualizadoEm: new Date().toISOString(),
    total: mangas.length,
    mangas
}), "utf8");

const mb = (fs.statSync(INDEX).size / 1024 / 1024).toFixed(2);
console.log(`Índice: ${mangas.length} mangás → ${INDEX} (${mb} MB)`);
