/**
 * Sincroniza catálogo: biblioteca local + metadados MangaDex (API oficial).
 * Uso: node scripts/sync-catalogo.mjs
 * Cron: agendar este script (Task Scheduler / cron) a cada 6h
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scanBibliotecaMulti, resolverBibliotecaDirs } from "../netlify/functions/biblioteca-local.mjs";
import { mergeCatalogo, MANGAS_DESTAQUE } from "../js/mangas-destaque.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LOG_DIR = path.join(ROOT, "logs");
const CATALOGO_PATH = path.join(DATA_DIR, "catalogo.json");
const MAP_PATH = path.join(DATA_DIR, "mangadex-map.json");

const MANGADEX_API = "https://api.mangadex.org";

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, "sync.log"), line + "\n", "utf8");
}

async function fetchJson(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "AkiraScan/2.0 (local reader; educational)" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

async function syncMangaDexEntry(slug, uuid) {
    try {
        const mangaRes = await fetchJson(`${MANGADEX_API}/manga/${uuid}?includes[]=cover_art&includes[]=author&includes[]=artist`);
        const attrs = mangaRes.data?.attributes;
        if (!attrs) return null;

        const rels = mangaRes.data.relationships || [];
        const coverRel = rels.find((r) => r.type === "cover_art");
        const coverFile = coverRel?.attributes?.fileName;
        const capa = coverFile
            ? `${MANGADEX_API}/covers/${uuid}/${coverFile}.512.jpg`
            : null;

        const feed = await fetchJson(`${MANGADEX_API}/manga/${uuid}/feed?translatedLanguage[]=pt-br&translatedLanguage[]=en&order[readableAt]=desc&limit=16&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`);

        const capitulos = (feed.data || []).map((ch) => {
            const a = ch.attributes;
            const num = parseFloat(a.chapter) || 0;
            return {
                id: `md-${ch.id}`,
                numero: num || ch.id.slice(0, 8),
                titulo: a.title || `Capítulo ${a.chapter || "?"}`,
                paginas: 0,
                publicadoEm: a.readableAt || a.publishAt,
                mangadexChapterId: ch.id,
                novo: Date.now() - new Date(a.readableAt || 0).getTime() < 7 * 86400000
            };
        }).reverse();

        const autor = rels.find((r) => r.type === "author")?.attributes?.name || "";
        const artista = rels.find((r) => r.type === "artist")?.attributes?.name || "";

        return {
            id: slug,
            titulo: attrs.title?.pt || attrs.title?.en || Object.values(attrs.title || {})[0] || slug,
            sinopse: attrs.description?.pt || attrs.description?.en || Object.values(attrs.description || {})[0] || "",
            autor,
            artista,
            generos: (attrs.tags || []).filter((t) => t.type === "tag").map((t) => t.attributes?.name?.en).filter(Boolean),
            status: attrs.status === "completed" ? "Completo" : "Em lançamento",
            capa: capa,
            banner: capa,
            mangadexId: uuid,
            capitulos,
            atualizadoEm: capitulos.length ? capitulos[capitulos.length - 1].publicadoEm : new Date().toISOString(),
            origem: "mangadex"
        };
    } catch (e) {
        log(`  ERRO MangaDex ${slug}: ${e.message}`);
        return null;
    }
}

async function buscarUuidMangaDex(titulo) {
    const url = `${MANGADEX_API}/manga?title=${encodeURIComponent(titulo)}&limit=1&includes[]=cover_art`;
    const data = await fetchJson(url);
    return data.data?.[0]?.id || null;
}

async function main() {
    log("AkiraScan sync — início");
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const dirs = resolverBibliotecaDirs(ROOT);
    const local = scanBibliotecaMulti(dirs);
    log(`  Local: ${local.length} mangás`);

    let map = {};
    if (fs.existsSync(MAP_PATH)) {
        try { map = JSON.parse(fs.readFileSync(MAP_PATH, "utf8")); } catch { /* */ }
    }

    const mdEntries = [];
    const alvos = MANGAS_DESTAQUE.filter((m) => m.popularidade >= 88).slice(0, 6);

    for (const alvo of alvos) {
        let uuid = map[alvo.id];
        if (!uuid) {
            try {
                uuid = await buscarUuidMangaDex(alvo.titulo);
                if (uuid) map[alvo.id] = uuid;
            } catch (e) {
                log(`  Busca MD ${alvo.id}: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 400));
        }
        if (!uuid) continue;
        log(`  MangaDex: ${alvo.titulo}`);
        const entry = await syncMangaDexEntry(alvo.id, uuid);
        if (entry) mdEntries.push(entry);
        await new Promise((r) => setTimeout(r, 500));
    }

    fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2), "utf8");

    const catalogo = mergeCatalogo([...local, ...mdEntries]);
    fs.writeFileSync(CATALOGO_PATH, JSON.stringify({
        atualizadoEm: new Date().toISOString(),
        total: catalogo.length,
        mangas: catalogo
    }, null, 2), "utf8");

    log(`  Catálogo gravado: ${catalogo.length} mangás → data/catalogo.json`);
    log("AkiraScan sync — concluído");
}

main().catch((e) => {
    log(`FATAL: ${e.message}`);
    process.exit(1);
});
