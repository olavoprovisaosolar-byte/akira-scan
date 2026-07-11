/**
 * Valida linkagem Terabox ↔ catálogo ↔ API cloud.
 *
 * Uso:
 *   node scripts/verify-terabox-link.mjs
 *   node scripts/verify-terabox-link.mjs --live
 *   node scripts/verify-terabox-link.mjs --live --sample=12
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LIVE = process.argv.includes("--live");
const SAMPLE = Number(process.argv.find((a) => a.startsWith("--sample="))?.split("=")[1] || 8);
const CLOUD_API = process.env.AKIRA_CLOUD_API || "https://akira-scan.netlify.app";

function lerJson(file, fb) {
    if (!fs.existsSync(file)) return fb;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fb;
    }
}

function capLegivel(remoto, staticHost = true) {
    if (!remoto) return false;
    if (!remoto.done) return false;
    if (!remoto.localPurged) return true;
    return !!(remoto.remote);
}

async function fetchJson(url, timeoutMs = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        return { ok: false, status: 0, error: e.message };
    } finally {
        clearTimeout(t);
    }
}

function pickSamples(caps, n) {
    const done = Object.entries(caps).filter(([, c]) => c.done && c.remote);
    const step = Math.max(1, Math.floor(done.length / n));
    const out = [];
    for (let i = 0; i < done.length && out.length < n; i += step) {
        out.push(done[i]);
    }
    return out;
}

async function main() {
    const idx = lerJson(path.join(ROOT, "data/cloud/chapters-index.json"), { caps: {}, porManga: {} });
    const cat = lerJson(path.join(ROOT, "data/catalogo-index.json"), { mangas: [] });
    const state = lerJson(path.join(ROOT, "data/terabox/upload-state.json"), { caps: {} });

    const caps = idx.caps || {};
    const capKeys = Object.keys(caps);
    const mangasIdx = new Set(Object.keys(idx.porManga || {}));
    const catIds = new Set((cat.mangas || []).map((m) => m.id));

    const erros = [];
    const avisos = [];

    // 1. Integridade do índice
    let semRemote = 0;
    let doneSemPages = 0;
    let invalidKeys = 0;

    for (const [key, rec] of Object.entries(caps)) {
        const [mangaId, capId] = key.split("/");
        if (!mangaId || !capId) {
            invalidKeys++;
            continue;
        }
        if (rec.done && !rec.remote) semRemote++;
        if (rec.done && rec.localPurged && !rec.remote) doneSemPages++;
        if (rec.mangaId && rec.mangaId !== mangaId) {
            erros.push(`ID inconsistente: ${key} mangaId=${rec.mangaId}`);
        }
    }

    const doneCaps = capKeys.filter((k) => caps[k].done).length;
    const purged = capKeys.filter((k) => caps[k].localPurged).length;
    const legiveis = capKeys.filter((k) => capLegivel(caps[k])).length;

    console.log("=== Índice Terabox ===");
    console.log(`Caps: ${capKeys.length} | done: ${doneCaps} | purged: ${purged} | legíveis: ${legiveis}`);
    console.log(`Mangás linkados: ${mangasIdx.size}`);
    console.log(`Upload-state: ${Object.keys(state.caps || {}).length} caps`);

    if (semRemote) avisos.push(`${semRemote} caps done sem remote`);
    if (doneSemPages) erros.push(`${doneSemPages} caps purged sem remote`);
    if (invalidKeys) erros.push(`${invalidKeys} chaves inválidas no índice`);

    // 2. Catálogo vs Terabox
    const noCat = [...mangasIdx].filter((id) => !catIds.has(id));
    const catComBackup = (cat.mangas || []).filter((m) =>
        fs.existsSync(path.join(ROOT, "data/toonlivre-backup/mangas", m.id, "chapters"))
    );
    const catSemTerabox = catComBackup.filter((m) => !mangasIdx.has(m.id));

    console.log("\n=== Catálogo ===");
    console.log(`No catálogo: ${catIds.size} | com backup local: ${catComBackup.length}`);
    console.log(`Com Terabox: ${mangasIdx.size} | backup sem Terabox: ${catSemTerabox.length}`);

    if (noCat.length) avisos.push(`${noCat.length} obras no Terabox fora do catálogo: ${noCat.slice(0, 3).join(", ")}`);

    // 3. Testes live API
    if (LIVE) {
        console.log(`\n=== API live (${CLOUD_API}) ===`);
        const status = await fetchJson(`${CLOUD_API}/api/cloud/status`);
        if (!status.ok) {
            erros.push(`API status falhou: ${status.status || status.error}`);
        } else {
            const liveTotal = status.data?.total || 0;
            console.log(`Status: OK — ${liveTotal} caps no servidor`);
            if (liveTotal > 0 && liveTotal < capKeys.length * 0.9) {
                avisos.push(`API Netlify desatualizada: servidor ${liveTotal} vs local ${capKeys.length} — rode terabox:sync-deploy + deploy Netlify`);
            }
        }

        const pinSamples = [
            ["obra-0f20295f", "cap-d501f6c4-01"],
            ["obra-35d0cfff", "cap-f83abfc9-53"]
        ];
        const samples = [
            ...pinSamples.map(([mangaId, capId]) => [`${mangaId}/${capId}`, caps[`${mangaId}/${capId}`] || { done: true }]),
            ...pickSamples(caps, Math.max(0, SAMPLE - pinSamples.length))
        ].filter(([, rec]) => rec);
        let apiOk = 0;
        let apiFail = 0;

        for (const [key, rec] of samples) {
            const [mangaId, capId] = key.split("/");
            const url = `${CLOUD_API}/api/cloud/pages?m=${encodeURIComponent(mangaId)}&ch=${encodeURIComponent(capId)}`;
            const res = await fetchJson(url);
            const pages = res.data?.pages || [];
            const valid = pages.length >= 1 && pages.every((p) => p.url);

            if (res.ok && valid) {
                apiOk++;
                console.log(`✓ ${key} — ${pages.length} págs`);
            } else {
                apiFail++;
                erros.push(`API falhou ${key}: status=${res.status} pages=${pages.length} ${res.error || ""}`.trim());
                console.log(`✗ ${key} — ${res.status || res.error || "sem páginas"}`);
            }
        }

        console.log(`API amostra: ${apiOk}/${samples.length} OK`);

        // Teste proxy de 1 página
        if (samples.length) {
            const [key] = samples[0];
            const [mangaId, capId] = key.split("/");
            const pageUrl = `${CLOUD_API}/api/cloud/page?m=${encodeURIComponent(mangaId)}&ch=${encodeURIComponent(capId)}&n=1`;
            const imgRes = await fetch(pageUrl, { method: "HEAD", cache: "no-store" }).catch(() => null);
            const ct = imgRes?.headers?.get("content-type") || "";
            if (imgRes?.ok && (ct.includes("image") || ct.includes("octet-stream"))) {
                console.log(`✓ Proxy página 1: ${ct}`);
            } else {
                erros.push(`Proxy página falhou: ${imgRes?.status || "sem resposta"} type=${ct}`);
            }
        }
    } else {
        console.log("\n(dica: use --live para testar API Netlify)");
    }

    // 4. Resultado
    console.log("\n=== Resultado ===");
    if (avisos.length) {
        console.log("Avisos:");
        avisos.forEach((a) => console.log(`  ⚠ ${a}`));
    }
    if (erros.length) {
        console.log("Erros:");
        erros.forEach((e) => console.log(`  ✗ ${e}`));
        process.exit(1);
    }
    console.log("✓ Linkagem Terabox validada sem erros críticos");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
