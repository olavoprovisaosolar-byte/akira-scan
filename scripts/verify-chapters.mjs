/**
 * Verifica capítulos com páginas reais no backup + amostra API.
 * Uso: node scripts/verify-chapters.mjs [--api]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { obterCapituloPaginasBackup } from "../netlify/functions/biblioteca-local.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const USE_API = process.argv.includes("--api");
const API = process.env.AKIRA_API || "http://127.0.0.1:5501";

const PAGE_RE = /\.(webp|jpg|jpeg|png|gif)$/i;
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, "data/catalogo-index.json"), "utf8"));
const mangas = idx.mangas || [];

function capsComPaginas(mangaId) {
    const chRoot = path.join(ROOT, "data/toonlivre-backup/mangas", mangaId, "chapters");
    if (!fs.existsSync(chRoot)) return [];
    const out = [];
    for (const capId of fs.readdirSync(chRoot)) {
        const pagesDir = path.join(chRoot, capId, "pages");
        if (!fs.existsSync(pagesDir)) continue;
        const n = fs.readdirSync(pagesDir).filter((f) => PAGE_RE.test(f)).length;
        if (n > 0) out.push({ capId, n });
    }
    return out;
}

function isDemo(pages) {
    return pages?.length && pages.every((p) => (p.url || p).includes("placehold.co"));
}

async function fetchApi(mangaId, capId) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    try {
        const res = await fetch(
            `${API}/api/biblioteca/${encodeURIComponent(mangaId)}/${encodeURIComponent(capId)}`,
            { signal: controller.signal }
        );
        const data = await res.json();
        return { ok: res.ok, demo: data.demo, local: data.local, count: data.pages?.length || 0 };
    } catch (e) {
        return { ok: false, error: e.message };
    } finally {
        clearTimeout(t);
    }
}

const stats = {
    total: mangas.length,
    comPaginas: 0,
    semBackup: 0,
    soMeta: 0,
    capsTotais: 0,
    capsComArquivo: 0
};
const comPaginas = [];
const soMeta = [];

for (const m of mangas) {
    const local = capsComPaginas(m.id);
    stats.capsTotais += (m.capitulos || []).length;
    stats.capsComArquivo += local.length;

    if (!fs.existsSync(path.join(ROOT, "data/toonlivre-backup/mangas", m.id))) {
        stats.semBackup++;
        soMeta.push({ id: m.id, titulo: m.titulo, motivo: "sem pasta no backup" });
        continue;
    }

    if (!local.length) {
        stats.soMeta++;
        soMeta.push({ id: m.id, titulo: m.titulo, motivo: "pastas de capítulo sem imagens" });
        continue;
    }

    stats.comPaginas++;
    comPaginas.push({ id: m.id, titulo: m.titulo, caps: local.length, primeiro: local[0].capId });
}

console.log("=== Verificação Akira Scan — capítulos ===\n");
console.log(`Mangás no catálogo:     ${stats.total}`);
console.log(`Com páginas reais:      ${stats.comPaginas} (${((stats.comPaginas / stats.total) * 100).toFixed(1)}%)`);
console.log(`Só metadados (vazio):   ${stats.soMeta}`);
console.log(`Sem pasta backup:       ${stats.semBackup}`);
console.log(`Caps no catálogo:       ${stats.capsTotais}`);
console.log(`Caps com imagens local: ${stats.capsComArquivo}`);

console.log("\n--- Mangás que FUNCIONAM (páginas no disco) ---");
comPaginas.forEach((x) => console.log(`  ✓ ${x.titulo} — ${x.caps} cap(s) local`));

if (USE_API && comPaginas.length) {
    console.log("\n--- Teste API (todos com páginas) ---");
    let apiOk = 0;
    for (const x of comPaginas) {
        const r = await fetchApi(x.id, x.primeiro);
        if (r.ok && r.local && !r.demo && r.count > 0) {
            apiOk++;
            console.log(`  ✓ ${x.titulo}: ${r.count} págs`);
        } else {
            console.log(`  ✗ ${x.titulo}: ${r.error || `demo=${r.demo} n=${r.count}`}`);
        }
    }
    console.log(`\nAPI: ${apiOk}/${comPaginas.length} OK`);
}

if (soMeta.length && soMeta.length <= 8) {
    console.log("\n--- Sem imagens ---");
    soMeta.forEach((x) => console.log(`  • ${x.titulo}`));
} else if (soMeta.length) {
    console.log(`\n--- ${soMeta.length} mangás sem imagens (precisam backup) ---`);
    console.log("  Ex.: " + soMeta.slice(0, 5).map((x) => x.titulo).join(", ") + " …");
}

console.log("\n→ Para baixar páginas faltantes: npm run backup:chapters");
process.exit(stats.comPaginas === stats.total ? 0 : 1);
