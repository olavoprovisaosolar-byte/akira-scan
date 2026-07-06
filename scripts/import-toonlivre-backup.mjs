/**
 * Importa backup ToonLivre → data/catalogo.json + Biblioteca_Mangas (capas/páginas locais)
 *
 * Uso: node scripts/import-toonlivre-backup.mjs
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { normalizarMangaRemoto } from "../netlify/functions/toonlivre-client.mjs";
import { scanBibliotecaMulti, resolverBibliotecaDirs } from "../netlify/functions/biblioteca-local.mjs";
import { mergeCatalogo } from "../js/mangas-destaque.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BACKUP = path.join(ROOT, "data", "toonlivre-backup");
const MANGAS_DIR = path.join(BACKUP, "mangas");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const BIBLIOTECA = path.join(ROOT, "Biblioteca_Mangas");
const REPORT = path.join(BACKUP, "import-report.json");

function localCoverPath(mangaId, file) {
    if (!file) return "";
    return `/backup/mangas/${encodeURIComponent(mangaId)}/${encodeURIComponent(file)}`;
}

function localPagePath(mangaId, capId, file) {
    return `/backup/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(capId)}/pages/${encodeURIComponent(file)}`;
}

function copiarParaBiblioteca(mangaId, capId, capDir) {
    const pagesDir = path.join(capDir, "pages");
    if (!fs.existsSync(pagesDir)) return 0;
    const destCap = path.join(BIBLIOTECA, mangaId, capId);
    fs.mkdirSync(destCap, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(pagesDir)) {
        const src = path.join(pagesDir, f);
        const dst = path.join(destCap, f);
        if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
        n++;
    }
    return n;
}

function importarManga(mangaId) {
    const metaPath = path.join(MANGAS_DIR, mangaId, "meta.json");
    if (!fs.existsSync(metaPath)) return null;

    const raw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const norm = normalizarMangaRemoto(raw, "/api/catalogo");

    const mangaDir = path.join(MANGAS_DIR, mangaId);
    const coverFile = fs.readdirSync(mangaDir).find((f) => f.startsWith("cover."));
    const bannerFile = fs.readdirSync(mangaDir).find((f) => f.startsWith("banner."));

    if (coverFile) norm.capa = localCoverPath(mangaId, coverFile);
    if (bannerFile) norm.banner = localCoverPath(mangaId, bannerFile);
    else if (coverFile) norm.banner = norm.capa;

    norm.origem = "toonlivre";
    norm.toonlivreId = mangaId;
    norm.backupLocal = true;

    const TOONLIVRE_BASE = "https://toonlivre.net";
    norm.capitulos = (norm.capitulos || []).map((c) => ({
        ...c,
        urlExterna: `${TOONLIVRE_BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(String(c.numero))}`
    }));

    const bibMangaDir = path.join(BIBLIOTECA, mangaId);
    fs.mkdirSync(bibMangaDir, { recursive: true });

    if (coverFile) {
        fs.copyFileSync(path.join(mangaDir, coverFile), path.join(bibMangaDir, "capa" + path.extname(coverFile)));
    }

    const capsDir = path.join(mangaDir, "chapters");
    let pagesCopied = 0;
    if (fs.existsSync(capsDir)) {
        for (const capId of fs.readdirSync(capsDir)) {
            const capDir = path.join(capsDir, capId);
            if (!fs.statSync(capDir).isDirectory()) continue;
            pagesCopied += copiarParaBiblioteca(mangaId, capId, capDir);
        }
    }

    fs.writeFileSync(path.join(bibMangaDir, "meta.json"), JSON.stringify({
        titulo: norm.titulo,
        sinopse: norm.sinopse,
        autor: norm.autor,
        artista: norm.artista,
        generos: norm.generos,
        status: norm.status,
        origem: "toonlivre-backup"
    }, null, 2), "utf8");

    return { norm, pagesCopied };
}

function main() {
    console.log("=== Importação backup ToonLivre ===");

    if (!fs.existsSync(MANGAS_DIR)) {
        console.error("Backup não encontrado. Execute: node scripts/backup-toonlivre-full.mjs");
        process.exit(1);
    }

    const ids = fs.readdirSync(MANGAS_DIR).filter((d) =>
        fs.existsSync(path.join(MANGAS_DIR, d, "meta.json"))
    );

    const remoto = [];
    let pagesTotal = 0;
    const falhas = [];

    for (const id of ids) {
        try {
            const r = importarManga(id);
            if (r) {
                remoto.push(r.norm);
                pagesTotal += r.pagesCopied;
            }
        } catch (e) {
            falhas.push({ id, motivo: e.message });
        }
    }

    const local = scanBibliotecaMulti(resolverBibliotecaDirs(ROOT));
    const catalogo = mergeCatalogo(local, remoto);

    fs.mkdirSync(path.dirname(CATALOGO), { recursive: true });
    fs.writeFileSync(CATALOGO, JSON.stringify({
        fonte: "toonlivre-backup+local",
        atualizadoEm: new Date().toISOString(),
        total: catalogo.length,
        toonlivre: remoto.length,
        mangas: catalogo
    }, null, 2), "utf8");

    console.log("  A gerar índice leve...");
    spawnSync(process.execPath, [path.join(__dirname, "build-catalog-index.mjs")], {
        cwd: ROOT,
        stdio: "inherit"
    });

    const report = {
        importadoEm: new Date().toISOString(),
        mangasImportados: remoto.length,
        mangasCatalogo: catalogo.length,
        paginasCopiadas: pagesTotal,
        falhas,
        catalogoPath: CATALOGO
    };
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");

    console.log(`  ${remoto.length} mangás importados → catálogo com ${catalogo.length} títulos`);
    console.log(`  ${pagesTotal} páginas copiadas para Biblioteca_Mangas`);
    console.log(`  Relatório: ${REPORT}`);
}

main();
