/**
 * Worker Terabox — lista arquivos remotos e grava cache JSON para o site.
 * Rode via cron (ex.: a cada 1h): npm run terabox:sync
 *
 * Uso:
 *   node scripts/terabox/sync.mjs
 *   node scripts/terabox/sync.mjs --check   # só valida login
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { unwrapErrorMessage } from "terabox-api/helper.js";
import {
    criarCliente,
    lerConfig,
    sleep,
    TeraboxBlockedError,
    withTeraboxRetry
} from "./client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const CACHE_DIR = path.join(ROOT, "data", "terabox");
const CACHE_FILE = path.join(CACHE_DIR, "mangas-cache.json");

function normalizarLink(res) {
    const raw = res?.link || res?.shorturl || res?.short_url || res?.data?.link;
    if (!raw) return null;
    if (String(raw).startsWith("http")) return raw;
    return `https://www.terabox.com/sharing/link?surl=${raw}`;
}

async function listarDiretorio(client, remoteDir) {
    const res = await withTeraboxRetry(() => client.getRemoteDir(remoteDir));
    if (res.errno === -9) {
        await garantirPasta(client, remoteDir);
        const retry = await withTeraboxRetry(() => client.getRemoteDir(remoteDir));
        if (retry.errno && retry.errno !== 0) {
            throw new Error(`listagem falhou (errno ${retry.errno})`);
        }
        return retry.list || retry.info || retry.entries || [];
    }
    if (res.errno && res.errno !== 0) {
        throw new Error(`listagem falhou (errno ${res.errno})`);
    }
    return res.list || res.info || res.entries || [];
}

async function obterLinkCompartilhamento(client, remotePath, delayMs) {
    await sleep(delayMs);
    const res = await withTeraboxRetry(() => client.shareSet([remotePath]));
    if (res.errno && res.errno !== 0) return null;
    return normalizarLink(res);
}

function mapearEntrada(entry, link = null) {
    const nome = entry.server_filename || entry.filename || entry.path?.split("/").pop() || "sem-nome";
    const caminho = entry.path || entry.server_path || nome;
    return {
        nome,
        caminho,
        tipo: entry.isdir === 1 || entry.isdir === true ? "pasta" : "arquivo",
        tamanho: entry.size || 0,
        modificadoEm: entry.server_mtime
            ? new Date(Number(entry.server_mtime) * 1000).toISOString()
            : null,
        link
    };
}

async function sincronizar() {
    const cfg = lerConfig();
    const client = await criarCliente();

    if (process.argv.includes("--check")) {
        console.log("✓ Login Terabox OK");
        return;
    }

    console.log(`Listando ${cfg.remoteDir}...`);
    const entradas = await listarDiretorio(client, cfg.remoteDir);
    const itens = [];

    for (const entry of entradas) {
        let link = null;
        const caminho = entry.path || `${cfg.remoteDir}/${entry.server_filename}`;

        if (cfg.createShares && (entry.isdir === 1 || entry.isdir === true)) {
            try {
                link = await obterLinkCompartilhamento(client, caminho, cfg.delayMs);
            } catch (e) {
                console.warn(`  [share] ${caminho}: ${unwrapErrorMessage(e) || e.message}`);
            }
        }

        itens.push(mapearEntrada(entry, link));

        if (cfg.recursive && (entry.isdir === 1 || entry.isdir === true)) {
            await sleep(cfg.delayMs);
            try {
                const filhos = await listarDiretorio(client, caminho);
                for (const filho of filhos) {
                    itens.push(mapearEntrada(filho, null));
                }
            } catch (e) {
                console.warn(`  [subdir] ${caminho}: ${unwrapErrorMessage(e) || e.message}`);
            }
        }

        await sleep(cfg.delayMs);
    }

    const cache = {
        atualizadoEm: new Date().toISOString(),
        origem: "terabox",
        pasta: cfg.remoteDir,
        total: itens.length,
        itens
    };

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
    console.log(`✓ Cache atualizado: ${CACHE_FILE} (${itens.length} itens)`);
}

sincronizar().catch((e) => {
    if (e instanceof TeraboxBlockedError) {
        console.error("[Terabox] Conta bloqueada (403). Aguarde antes de sincronizar novamente.");
    }
    console.error("FATAL:", unwrapErrorMessage(e) || e.message);
    process.exit(1);
});
