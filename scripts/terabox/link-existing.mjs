/**
 * Liga mangás/capítulos já existentes no Terabox ao upload-state + chapters-index.
 * Não faz upload — só reconcilia pastas remotas com o catálogo local.
 *
 * Uso:
 *   node scripts/terabox/link-existing.mjs
 *   node scripts/terabox/link-existing.mjs --dry-run
 *   node scripts/terabox/link-existing.mjs --manga=obra-0f20295f
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { criarCliente, lerConfig, sleep, withTeraboxRetry } from "./client.mjs";
import { listarPaginasLocais } from "./upload-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const STATE_FILE = path.join(ROOT, "data", "terabox", "upload-state.json");
const MANGAS_DIR = path.join(ROOT, "data", "toonlivre-backup", "mangas");
const BIBLIOTECA = path.join(ROOT, "Biblioteca_Mangas");
const PAGE_EXT = /\.(webp|jpg|jpeg|png)$/i;

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_MISSING = process.argv.includes("--only-missing");
const MANGA_FILTER = process.argv.find((a) => a.startsWith("--manga="))?.split("=")[1] || "";

function lerJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function guardarState(state) {
    if (DRY_RUN) return;
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function numeroDoCap(mangaId, capId, pagesDir) {
    const metaCandidates = [
        path.join(path.dirname(pagesDir), "meta.json"),
        path.join(MANGAS_DIR, mangaId, "chapters", capId, "meta.json"),
        path.join(BIBLIOTECA, mangaId, capId, "meta.json")
    ];
    for (const metaCap of metaCandidates) {
        if (!fs.existsSync(metaCap)) continue;
        try {
            const m = JSON.parse(fs.readFileSync(metaCap, "utf8"));
            if (m.numero != null) return String(m.numero);
        } catch { /* ignore */ }
    }
    const tail = String(capId).match(/-(\d+(?:\.\d+)?)$/);
    return tail ? tail[1] : null;
}

/** numero → capId a partir do backup local */
function mapaCapsLocais(mangaId) {
    const byNumero = new Map();
    const capsDir = path.join(MANGAS_DIR, mangaId, "chapters");
    if (fs.existsSync(capsDir)) {
        for (const capId of fs.readdirSync(capsDir)) {
            const pagesDir = path.join(capsDir, capId, "pages");
            const paginas = listarPaginasLocais(pagesDir);
            const num = numeroDoCap(mangaId, capId, pagesDir);
            if (!num) continue;
            byNumero.set(String(num), { capId, paginas: paginas.length, pagesDir });
        }
    }
    if (fs.existsSync(path.join(BIBLIOTECA, mangaId))) {
        for (const capId of fs.readdirSync(path.join(BIBLIOTECA, mangaId))) {
            if (["meta.json", "cover.webp", "chapters", "capa.webp"].includes(capId)) continue;
            const capDir = path.join(BIBLIOTECA, mangaId, capId);
            if (!fs.statSync(capDir).isDirectory()) continue;
            const pagesDir = fs.existsSync(path.join(capDir, "pages"))
                ? path.join(capDir, "pages")
                : capDir;
            const paginas = listarPaginasLocais(pagesDir);
            const num = numeroDoCap(mangaId, capId, pagesDir);
            if (!num || byNumero.has(String(num))) continue;
            byNumero.set(String(num), { capId, paginas: paginas.length, pagesDir });
        }
    }
    return byNumero;
}

function extrairObraId(nome) {
    const m = String(nome || "").match(/__(obra-[a-f0-9]+)/i);
    return m?.[1] || null;
}

function ehPastaDuplicada(nome) {
    return /__obra-[a-f0-9]+_\d{8}_\d+$/i.test(String(nome || ""));
}

async function listarDir(client, remoteDir) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await withTeraboxRetry(() => client.getRemoteDir(remoteDir));
            if (res.errno && res.errno !== 0) return [];
            return res.list || res.info || res.entries || [];
        } catch (e) {
            if (attempt === 2) throw e;
            await sleep(2000 * (attempt + 1));
        }
    }
    return [];
}

async function contarPaginasRemotas(client, remoteDir) {
    try {
        const entries = await listarDir(client, remoteDir);
        return entries.filter((e) => !(e.isdir === 1 || e.isdir === true))
            .map((e) => e.server_filename || e.filename || "")
            .filter((f) => PAGE_EXT.test(f)).length;
    } catch {
        return -1;
    }
}

async function main() {
    const cfg = lerConfig();
    const client = await criarCliente();
    const state = lerJson(STATE_FILE, { caps: {}, stats: { ok: 0, fail: 0, skip: 0, files: 0 } });

    console.log(`Ligando mangás existentes no Terabox (${cfg.remoteDir})${DRY_RUN ? " [dry-run]" : ""}...`);

    const raiz = await listarDir(client, cfg.remoteDir);
    const pastasManga = raiz.filter((e) => e.isdir === 1 || e.isdir === true);

    const porObra = new Map();
    for (const entry of pastasManga) {
        const nome = entry.server_filename || entry.filename || path.basename(entry.path || "");
        const obraId = extrairObraId(nome);
        if (!obraId) continue;
        if (MANGA_FILTER && obraId !== MANGA_FILTER) continue;
        if (ehPastaDuplicada(nome)) continue;

        const caminho = entry.path || `${cfg.remoteDir}/${nome}`;
        const mod = Number(entry.server_mtime || 0);
        const prev = porObra.get(obraId);
        if (!prev || mod > prev.mod) {
            porObra.set(obraId, { nome, caminho, mod });
        }
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    let erros = 0;

    for (const [obraId, pasta] of porObra) {
        const chaptersDir = `${pasta.caminho}/chapters`;
        let capsRemotos;
        try {
            capsRemotos = await listarDir(client, chaptersDir);
        } catch (e) {
            console.warn(`! ${obraId}: listagem falhou — ${e.message}`);
            erros++;
            continue;
        }
        const capPastas = capsRemotos.filter((e) => e.isdir === 1 || e.isdir === true);
        const localMap = mapaCapsLocais(obraId);

        for (const capEntry of capPastas) {
            const capNome = capEntry.server_filename || capEntry.filename || "";
            const numMatch = capNome.match(/^cap-(\d+(?:\.\d+)?)$/i);
            if (!numMatch) continue;
            const numero = numMatch[1];
            const local = localMap.get(numero);
            const capId = local?.capId || `cap-${numero}`;
            const key = `${obraId}/${capId}`;
            const capRemote = `${chaptersDir}/${capNome}`;
            const prev = state.caps[key];

            if (ONLY_MISSING && prev?.done) {
                skipped++;
                continue;
            }

            const remotoTotal = await contarPaginasRemotas(client, capRemote);
            if (remotoTotal < 1) {
                if (remotoTotal < 0) erros++;
                continue;
            }

            const localTotal = local?.paginas || 0;
            const localPurged = localTotal === 0;

            if (prev?.done && prev.remote === capRemote && prev.uploaded >= remotoTotal) {
                skipped++;
                continue;
            }

            const rec = {
                done: remotoTotal > 0,
                uploaded: remotoTotal,
                total: Math.max(remotoTotal, localTotal, prev?.total || 0),
                remote: capRemote,
                localPurged: localPurged || !!prev?.localPurged,
                linkedAt: new Date().toISOString(),
                origem: "link-existing"
            };

            if (!prev) {
                added++;
                console.log(`+ ${key} → ${remotoTotal} págs (${capRemote})`);
            } else {
                updated++;
                console.log(`~ ${key} → ${remotoTotal} págs`);
            }

            state.caps[key] = { ...prev, ...rec };
            await sleep(120);
        }
    }

    guardarState(state);

    console.log(`\nResumo: +${added} novos, ~${updated} atualizados, ${skipped} já OK, ${erros} erros, ${porObra.size} obras no Terabox`);

    if (!DRY_RUN && (added > 0 || updated > 0)) {
        console.log("\nReconstruindo chapters-index...");
        const r = spawnSync(process.execPath, [path.join(__dirname, "..", "build-terabox-chapters-index.mjs")], {
            cwd: ROOT,
            stdio: "inherit"
        });
        if (r.status !== 0) process.exit(r.status || 1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
