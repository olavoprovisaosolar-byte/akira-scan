/**
 * Sincronização ToonLivre → data/catalogo.json
 * Cron: scripts/cron-sync.bat ou Task Scheduler
 *
 * Variáveis: TOONLIVRE_BASE_URL, TOONLIVRE_TOKEN_HEADER, TOONLIVRE_TOKEN_VALUE, TOONLIVRE_API_KEY
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    pesquisarMangas,
    obterMangaPorSlug,
    normalizarMangaRemoto
} from "../netlify/functions/toonlivre-client.mjs";
import { scanBibliotecaMulti, resolverBibliotecaDirs } from "../netlify/functions/biblioteca-local.mjs";
import { mergeCatalogo } from "../js/mangas-destaque.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const LOG = path.join(ROOT, "logs", "sync.log");
const CATALOGO = path.join(DATA, "catalogo.json");
const STATE = path.join(DATA, "sync-state.json");

const MAX_PAGINAS = Number(process.env.TOONLIVRE_SYNC_PAGES || 0);
const DETALHE_LIMITE = Number(process.env.TOONLIVRE_SYNC_DETAIL || 0);

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, line + "\n", "utf8");
}

function lerState() {
    try {
        return JSON.parse(fs.readFileSync(STATE, "utf8"));
    } catch {
        return { ultimoSync: null, mangas: {} };
    }
}

function guardarState(state) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2), "utf8");
}

async function main() {
    log("=== ToonLivre sync — início ===");
    const state = lerState();
    const remotoMap = new Map();

    try {
        let totalPages = MAX_PAGINAS || 999;
        for (let page = 1; page <= totalPages; page++) {
            log(`  Pesquisa página ${page}${MAX_PAGINAS ? `/${MAX_PAGINAS}` : ""}`);
            const data = await pesquisarMangas({ page, limit: 48, sortBy: "popular" });
            if (page === 1 && !MAX_PAGINAS) {
                totalPages = data.pagination?.totalPages || 1;
                log(`  Total API: ${data.pagination?.totalItems || "?"} mangás em ${totalPages} páginas`);
            }
            const lista = data.mangas || [];
            if (!lista.length) break;

            for (const m of lista) {
                const slug = m.id || m.uploadSlug;
                if (!slug || remotoMap.has(slug)) continue;
                remotoMap.set(slug, normalizarMangaRemoto(m, "/api/catalogo"));
            }

            if (!data.pagination?.hasNextPage) break;
            await new Promise((r) => setTimeout(r, 400));
        }

        log(`  ${remotoMap.size} mangás na listagem — a obter detalhes...`);

        let detalhes = 0;
        const detailLimit = DETALHE_LIMITE || remotoMap.size;
        for (const [slug, base] of remotoMap.entries()) {
            if (detalhes >= detailLimit) break;
            try {
                const full = await obterMangaPorSlug(slug);
                const norm = normalizarMangaRemoto({ ...base, ...full }, "/api/catalogo");
                remotoMap.set(slug, norm);

                const prev = state.mangas[slug];
                const ultCap = norm.capitulos[0];
                if (ultCap && prev?.ultimoCapId !== ultCap.id) {
                    log(`  NOVO capítulo: ${norm.titulo} — Cap. ${ultCap.numero}`);
                }
                state.mangas[slug] = {
                    ultimoCapId: ultCap?.id,
                    ultimoCapNum: ultCap?.numero,
                    totalCaps: norm.capitulos.length,
                    atualizadoEm: norm.atualizadoEm
                };
                detalhes++;
            } catch (e) {
                log(`  ERRO detalhe ${slug}: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 350));
        }

        const remoto = [...remotoMap.values()];
        const local = scanBibliotecaMulti(resolverBibliotecaDirs(ROOT));
        const catalogo = mergeCatalogo(local, remoto);

        fs.mkdirSync(DATA, { recursive: true });
        fs.writeFileSync(CATALOGO, JSON.stringify({
            fonte: "toonlivre+local",
            atualizadoEm: new Date().toISOString(),
            total: catalogo.length,
            toonlivre: remoto.length,
            mangas: catalogo
        }, null, 2), "utf8");

        state.ultimoSync = new Date().toISOString();
        guardarState(state);
        log(`=== Concluído: ${catalogo.length} mangás (${remoto.length} ToonLivre) ===`);
    } catch (e) {
        log(`FATAL: ${e.message}`);
        process.exit(1);
    }
}

main();
