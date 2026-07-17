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
const CLOUD_INDEX = path.join(ROOT, "data", "cloud", "chapters-index.json");

function lerIndiceCloud() {
    if (!fs.existsSync(CLOUD_INDEX)) return null;
    try {
        return JSON.parse(fs.readFileSync(CLOUD_INDEX, "utf8"));
    } catch {
        return null;
    }
}

/** Caps prontos — só URLs remotas vivas (Telegra, Freeimage, Catbox, R2). */
function capLegivelIndice(rec) {
    if (!rec?.done) return false;
    return !!(rec.pages?.some((p) => {
        const u = String(p.url || "");
        return u.includes("telegra.ph")
            || u.includes("catbox.moe")
            || u.includes("iili.io")
            || u.includes("freeimage.host")
            || u.includes("/api/cloud/page");
    }));
}

function prontosDoIndice(cloudIdx, mangaId) {
    let n = 0;
    for (const rec of Object.values(cloudIdx?.caps || {})) {
        if (rec.mangaId === mangaId && capLegivelIndice(rec)) n++;
    }
    return n;
}

function coverExists(mangaId) {
    if (!mangaId) return null;
    for (const ext of ["webp", "jpg", "jpeg", "png"]) {
        const rel = `data/toonlivre-backup/mangas/${mangaId}/cover.${ext}`;
        if (fs.existsSync(path.join(ROOT, rel))) return rel;
    }
    return null;
}

/** Normaliza capa/banner para caminhos publicados no GitHub Pages. */
function fixMediaPath(p, mangaId = "") {
    if (!p) return coverExists(mangaId) || "";
    let out = p;
    if (out.startsWith("/backup/mangas/")) {
        out = `data/toonlivre-backup/mangas/${out.slice("/backup/mangas/".length)}`;
    } else if (out.startsWith("/data/")) {
        out = out.slice(1);
    } else {
        out = out.replace(/^\//, "");
    }

    const bib = out.match(/^biblioteca\/([^/]+)\/(?:capa|cover)\.[a-z0-9]+$/i);
    if (bib) {
        const found = coverExists(bib[1]);
        if (found) return found;
    }

    if (out.startsWith("data/toonlivre-backup/mangas/") && fs.existsSync(path.join(ROOT, out))) {
        return out;
    }

    const found = coverExists(mangaId);
    if (found) return found;
    return out;
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

    const capa = fixMediaPath(m.capa || m.coverUrl || "", m.id);
    const banner = fixMediaPath(m.banner || m.capa || "", m.id);

    return {
        id: m.id,
        titulo: m.titulo || m.title,
        sinopse: (m.sinopse || m.description || "").slice(0, 280),
        autor: m.autor || m.author || "",
        generos: m.generos || m.genres || [],
        status: m.status || "Em lançamento",
        capa,
        banner: banner || capa,
        popularidade: m.popularidade ?? m.popularity ?? 50,
        capitulos: caps.length ? caps : [{ id: "cap-1", numero: 1, publicadoEm: m.atualizadoEm }],
        totalCapitulos: totalCaps,
        atualizadoEm: m.atualizadoEm || caps[0]?.publicadoEm,
        origem: m.origem || "biblioteca"
    };
}

const data = JSON.parse(fs.readFileSync(FULL, "utf8"));

let rewritten = 0;
for (const m of data.mangas || []) {
    const capa = fixMediaPath(m.capa || m.coverUrl || "", m.id);
    const banner = fixMediaPath(m.banner || m.capa || "", m.id);
    if (capa && capa !== m.capa) {
        m.capa = capa;
        rewritten++;
    }
    if (banner && banner !== m.banner) m.banner = banner;
    if (m.coverUrl && capa) m.coverUrl = capa;
}
if (rewritten) {
    data.atualizadoEm = new Date().toISOString();
    fs.writeFileSync(FULL, JSON.stringify(data, null, 2), "utf8");
    console.log(`Catálogo: ${rewritten} capas reescritas → backup cover.*`);
}

const cloudIdx = lerIndiceCloud();

const mangas = (data.mangas || []).map((m) => {
    const slim = slimManga(m);
    const syncProntos = prontosDoIndice(cloudIdx, m.id);
    if (!syncProntos) return slim;
    return {
        ...slim,
        syncProntos,
        totalCapitulos: Math.max(syncProntos, slim.totalCapitulos || 0)
    };
});

fs.writeFileSync(INDEX, JSON.stringify({
    fonte: "catalogo-index",
    atualizadoEm: new Date().toISOString(),
    total: mangas.length,
    cloudIndexEm: cloudIdx?.atualizadoEm || null,
    mangas
}), "utf8");

const mb = (fs.statSync(INDEX).size / 1024 / 1024).toFixed(2);
const withBackup = mangas.filter((m) => String(m.capa || "").includes("toonlivre-backup")).length;
const comProntos = mangas.filter((m) => (m.syncProntos || 0) > 0).length;
const totalProntos = mangas.reduce((n, m) => n + (m.syncProntos || 0), 0);
console.log(`Índice: ${mangas.length} mangás → ${INDEX} (${mb} MB, capas backup: ${withBackup})`);
console.log(`Linkados: ${comProntos} mangás com caps legíveis (${totalProntos} caps prontos no índice)`);
