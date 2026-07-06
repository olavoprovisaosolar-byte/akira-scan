/**
 * Gera data/terabox/chapters-index.json — mapa manga/cap → Terabox (para o site estático).
 *
 * Uso:
 *   node scripts/build-terabox-chapters-index.mjs
 *   node scripts/build-terabox-chapters-index.mjs --dlinks --limit=80
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_FILE = path.join(ROOT, "data", "terabox", "upload-state.json");
const CACHE_FILE = path.join(ROOT, "data", "terabox", "mangas-cache.json");
const OUT_FILE = path.join(ROOT, "data", "terabox", "chapters-index.json");

const WITH_DLINKS = process.argv.includes("--dlinks");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 0);
const PAGE_EXT = /\.(webp|jpg|jpeg|png)$/i;

function lerJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function numeroDoRemote(remote) {
    const m = String(remote || "").match(/\/cap-(\d+(?:\.\d+)?)$/i);
    return m ? m[1] : null;
}

function sharePorManga(cache, mangaId) {
    for (const item of cache?.itens || []) {
        if (item.tipo !== "pasta" || !item.link) continue;
        if (item.caminho?.includes(`__${mangaId}`) || item.nome?.includes(mangaId)) {
            return item.link;
        }
    }
    return null;
}

function ordenarPaginas(files) {
    return [...files].sort((a, b) => {
        const na = Number(String(a).match(/(\d+)/)?.[1] || 0);
        const nb = Number(String(b).match(/(\d+)/)?.[1] || 0);
        return na - nb || String(a).localeCompare(String(b));
    });
}

async function listarPaginasRemotas(client, remoteDir) {
    const res = await client.getRemoteDir(remoteDir);
    if (res.errno && res.errno !== 0) return [];
    const entries = res.list || res.info || res.entries || [];
    return ordenarPaginas(
        entries
            .filter((e) => !(e.isdir === 1 || e.isdir === true))
            .map((e) => e.path || `${remoteDir}/${e.server_filename}`)
            .filter((p) => PAGE_EXT.test(p))
    );
}

async function dlinksParaPaths(client, paths) {
    if (!paths.length) return [];
    const meta = await client.getFileMeta(paths);
    const items = meta?.info || meta?.list || [];
    return items
        .map((f, index) => ({
            index,
            name: f.server_filename || f.filename || path.basename(paths[index] || ""),
            url: f.dlink || f.dlink_url || ""
        }))
        .filter((p) => p.url);
}

async function main() {
    const { unwrapErrorMessage } = WITH_DLINKS
        ? await import("terabox-api/helper.js")
        : { unwrapErrorMessage: (e) => e?.message || String(e) };
    const { criarCliente, sleep } = WITH_DLINKS
        ? await import("./terabox/client.mjs")
        : { criarCliente: async () => null, sleep: async () => {} };
    const state = lerJson(STATE_FILE, { caps: {} });
    const cache = lerJson(CACHE_FILE, { itens: [] });
    const caps = {};
    const porManga = {};
    let dlinkCount = 0;

    let client = null;
    if (WITH_DLINKS) {
        client = await criarCliente();
        console.log("Buscando dlinks Terabox (pode demorar)...");
    }

    for (const [key, entry] of Object.entries(state.caps || {})) {
        const [mangaId, capId] = key.split("/");
        if (!mangaId || !capId || !entry?.remote) continue;

        const done = !!entry.done;
        const uploaded = entry.uploaded || 0;
        if (!done && uploaded < 1) continue;

        const numero = numeroDoRemote(entry.remote);
        const rec = {
            mangaId,
            capId,
            numero,
            remote: entry.remote,
            done,
            uploaded: entry.uploaded || 0,
            total: entry.total || 0,
            localPurged: !!entry.localPurged,
            shareUrl: sharePorManga(cache, mangaId)
        };

        if (WITH_DLINKS && client && done && (!LIMIT || dlinkCount < LIMIT)) {
            try {
                const paths = await listarPaginasRemotas(client, entry.remote);
                if (paths.length) {
                    rec.pages = await dlinksParaPaths(client, paths);
                    if (rec.pages.length) dlinkCount++;
                }
                await sleep(300);
            } catch (e) {
                rec.dlinkErro = unwrapErrorMessage(e) || e.message;
            }
        }

        caps[key] = rec;
        if (!porManga[mangaId]) {
            porManga[mangaId] = { totalCaps: 0, doneCaps: 0, purgedCaps: 0 };
        }
        porManga[mangaId].totalCaps++;
        if (done) porManga[mangaId].doneCaps++;
        if (entry.localPurged) porManga[mangaId].purgedCaps++;
    }

    const out = {
        atualizadoEm: new Date().toISOString(),
        origem: "upload-state",
        total: Object.keys(caps).length,
        comDlinks: dlinkCount,
        caps,
        porManga
    };

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(out), "utf8");

    const cloudOut = path.join(ROOT, "data", "cloud", "chapters-index.json");
    fs.mkdirSync(path.dirname(cloudOut), { recursive: true });
    fs.copyFileSync(OUT_FILE, cloudOut);

    const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
    console.log(`Índice remoto: ${out.total} caps → ${OUT_FILE} (${kb} KB, dlinks: ${dlinkCount})`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
