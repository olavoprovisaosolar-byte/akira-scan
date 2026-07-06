/**
 * Sincroniza metadados de capítulos do backup → estrutura chapters/ + catálogo.
 * Cria meta.json por capítulo mesmo quando as páginas ainda não foram baixadas.
 *
 * Uso:
 *   node scripts/sync-chapters-backup.mjs
 *   node scripts/sync-chapters-backup.mjs --copiar-biblioteca
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BACKUP = path.join(ROOT, "data", "toonlivre-backup");
const MANGAS_DIR = path.join(BACKUP, "mangas");
const BIBLIOTECA = path.join(ROOT, "Biblioteca_Mangas");
const INDEX_FILE = path.join(BACKUP, "chapters-index.json");
const REPORT_FILE = path.join(BACKUP, "chapters-sync-report.json");
const TOONLIVRE_BASE = "https://toonlivre.net";

const COPIAR_BIB = process.argv.includes("--copiar-biblioteca");

function capsFromMeta(meta) {
    const list = meta.chapters || meta.capitulos || meta.recentChapters || [];
    return list
        .map((c) => ({
            id: c.id,
            numero: Number(c.number ?? c.numero ?? c.chapterNumber) || 0,
            titulo: c.title || c.titulo || "",
            pageCount: c.pageCount ?? c.page_count ?? c.paginas ?? 0,
            releaseDate: c.releaseDate || c.publishedAt || null
        }))
        .filter((c) => c.id && c.numero > 0);
}

function paginasLocais(pagesDir) {
    if (!fs.existsSync(pagesDir)) return 0;
    return fs.readdirSync(pagesDir).filter((f) => /\.(webp|jpg|jpeg|png|svg)$/i.test(f)).length;
}

function copiarDeBiblioteca(mangaId, capId, destPagesDir) {
    const src = path.join(BIBLIOTECA, mangaId, capId);
    if (!fs.existsSync(src)) return 0;
    fs.mkdirSync(destPagesDir, { recursive: true });
    let n = 0;
    for (const f of fs.readdirSync(src)) {
        if (!/\.(webp|jpg|jpeg|png|svg)$/i.test(f)) continue;
        const from = path.join(src, f);
        const to = path.join(destPagesDir, f);
        if (!fs.existsSync(to)) fs.copyFileSync(from, to);
        n++;
    }
    return n;
}

function syncManga(mangaId, stats) {
    const metaPath = path.join(MANGAS_DIR, mangaId, "meta.json");
    if (!fs.existsSync(metaPath)) return;

    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const caps = capsFromMeta(meta);
    if (!caps.length) return;

    stats.mangas++;
    stats.capitulosTotal += caps.length;

    for (const cap of caps) {
        const capDir = path.join(MANGAS_DIR, mangaId, "chapters", cap.id);
        const pagesDir = path.join(capDir, "pages");
        const capMetaPath = path.join(capDir, "meta.json");

        const localPages = paginasLocais(pagesDir);
        if (COPIAR_BIB && localPages === 0) {
            const copied = copiarDeBiblioteca(mangaId, cap.id, pagesDir);
            if (copied > 0) stats.paginasCopiadas += copied;
        }

        const pagesNow = paginasLocais(pagesDir);
        const capMeta = {
            id: cap.id,
            mangaId,
            numero: cap.numero,
            titulo: cap.titulo,
            pageCount: cap.pageCount,
            pagesLocal: pagesNow,
            pagesBackedUp: pagesNow > 0,
            releaseDate: cap.releaseDate,
            urlExterna: `${TOONLIVRE_BASE}/${encodeURIComponent(mangaId)}/${encodeURIComponent(String(cap.numero))}`,
            syncedAt: new Date().toISOString()
        };

        fs.mkdirSync(capDir, { recursive: true });
        fs.writeFileSync(capMetaPath, JSON.stringify(capMeta, null, 2), "utf8");
        stats.capitulosMeta++;

        if (pagesNow > 0) {
            stats.capitulosComPaginas++;
            stats.paginasTotal += pagesNow;
        } else {
            stats.capitulosSemPaginas++;
        }
    }
}

function main() {
    console.log("=== Sync metadados de capítulos ===");

    if (!fs.existsSync(MANGAS_DIR)) {
        console.error("Backup não encontrado:", MANGAS_DIR);
        process.exit(1);
    }

    const stats = {
        mangas: 0,
        capitulosTotal: 0,
        capitulosMeta: 0,
        capitulosComPaginas: 0,
        capitulosSemPaginas: 0,
        paginasTotal: 0,
        paginasCopiadas: 0,
        syncedAt: new Date().toISOString()
    };

    const mangaIds = fs.readdirSync(MANGAS_DIR).filter((d) =>
        fs.existsSync(path.join(MANGAS_DIR, d, "meta.json"))
    );

    let i = 0;
    for (const id of mangaIds) {
        i++;
        if (i % 50 === 0) console.log(`  ${i}/${mangaIds.length}...`);
        syncManga(id, stats);
    }

    const index = {
        geradoEm: stats.syncedAt,
        mangas: stats.mangas,
        capitulos: stats.capitulosMeta,
        comPaginas: stats.capitulosComPaginas,
        semPaginas: stats.capitulosSemPaginas,
        paginas: stats.paginasTotal
    };
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
    fs.writeFileSync(REPORT_FILE, JSON.stringify(stats, null, 2), "utf8");

    console.log(`  ${stats.mangas} mangás | ${stats.capitulosMeta} capítulos indexados`);
    console.log(`  ${stats.capitulosComPaginas} com páginas locais | ${stats.capitulosSemPaginas} só metadados`);
    console.log(`  ${stats.paginasTotal} páginas no backup`);
    console.log(`  Índice: ${INDEX_FILE}`);

    console.log("\n▶ Reimportando catálogo...");
    const r = spawnSync(process.execPath, [path.join(__dirname, "import-toonlivre-backup.mjs")], {
        cwd: ROOT,
        stdio: "inherit"
    });
    if (r.status !== 0) process.exit(r.status || 1);

    console.log("\n✓ Sync concluído.");
}

main();
