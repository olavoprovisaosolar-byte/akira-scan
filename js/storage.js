/**
 * AkiraScan — Favoritos, histórico e continuar lendo.
 * Local: localStorage. Com sessão API: sync via Netlify Blobs.
 */
import { normalizarNumeroProgresso } from "./services/chapter-label.js";
import { temSessaoApi, apiGuardarDados, apiObterDados } from "./user-api.js";

const STORAGE_KEY = "akirascan_v2";
let pushTimer = null;
let syncEmCurso = false;

function ler() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : criarVazio();
    } catch {
        return criarVazio();
    }
}

function criarVazio() {
    return {
        favoritos: [],
        historico: {},
        ultimaAtualizacao: null
    };
}

function guardar(dados) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    agendarPushNuvem();
}

function exportarDados() {
    const dados = ler();
    return {
        favoritos: dados.favoritos || [],
        historico: dados.historico || {},
        ultimaAtualizacao: dados.ultimaAtualizacao || null
    };
}

function mesclarHistorico(local = {}, remoto = {}) {
    const saida = { ...local };
    for (const [id, entrada] of Object.entries(remoto)) {
        const atual = saida[id];
        const tsLocal = atual?.atualizadoEm || 0;
        const tsRemoto = entrada?.atualizadoEm || 0;
        if (!atual || tsRemoto >= tsLocal) {
            saida[id] = entrada;
        }
    }
    return saida;
}

function mesclarFavoritos(local = [], remoto = []) {
    return [...new Set([...local, ...remoto])];
}

function aplicarRemoto(remoto) {
    if (!remoto) return;
    const local = ler();
    const tsLocal = Date.parse(local.ultimaAtualizacao || "") || 0;
    const tsRemoto = Date.parse(remoto.ultimaAtualizacao || "") || 0;

    if (tsRemoto > tsLocal) {
        local.favoritos = remoto.favoritos || [];
        local.historico = remoto.historico || {};
        local.ultimaAtualizacao = remoto.ultimaAtualizacao;
    } else {
        local.favoritos = mesclarFavoritos(local.favoritos, remoto.favoritos);
        local.historico = mesclarHistorico(local.historico, remoto.historico);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
}

function agendarPushNuvem() {
    if (!temSessaoApi()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
        const dados = exportarDados();
        dados.ultimaAtualizacao = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
        await apiGuardarDados(dados);
    }, 1200);
}

export async function sincronizarComNuvem() {
    if (!temSessaoApi() || syncEmCurso) return false;
    syncEmCurso = true;
    try {
        const remoto = await apiObterDados();
        if (remoto) aplicarRemoto(remoto);
        return Boolean(remoto);
    } catch {
        return false;
    } finally {
        syncEmCurso = false;
    }
}

export function obterFavoritos() {
    return ler().favoritos || [];
}

export function ehFavorito(mangaId) {
    return obterFavoritos().includes(mangaId);
}

export function alternarFavorito(mangaId) {
    const dados = ler();
    const set = new Set(dados.favoritos || []);
    if (set.has(mangaId)) set.delete(mangaId);
    else set.add(mangaId);
    dados.favoritos = [...set];
    dados.ultimaAtualizacao = new Date().toISOString();
    guardar(dados);
    return set.has(mangaId);
}

export function obterHistorico() {
    return ler().historico || {};
}

export function salvarProgresso(mangaId, info) {
    const dados = ler();
    dados.historico = dados.historico || {};
    const capitulo_atual = normalizarNumeroProgresso(info.capitulo_atual, info.chapterId);
    dados.historico[mangaId] = {
        ...info,
        capitulo_atual,
        mangaId,
        atualizadoEm: Date.now()
    };
    dados.ultimaAtualizacao = new Date().toISOString();
    guardar(dados);
}

export function obterContinuarLista() {
    const hist = obterHistorico();
    return Object.values(hist)
        .map((h) => ({
            ...h,
            capitulo_atual: normalizarNumeroProgresso(h.capitulo_atual, h.chapterId)
        }))
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0))
        .slice(0, 12);
}

export function limparHistorico() {
    const dados = ler();
    dados.historico = {};
    dados.ultimaAtualizacao = new Date().toISOString();
    guardar(dados);
}

export function obterUltimaAtualizacaoSync() {
    return ler().ultimaAtualizacao;
}

export function marcarUltimaAtualizacaoSync(iso) {
    const dados = ler();
    dados.ultimaAtualizacao = iso || new Date().toISOString();
    guardar(dados);
}

export function criarHistoricoDemonstracao() {
    const dados = ler();
    dados.historico = {
        "leitor-onisciente": {
            titulo: "Ponto de Vista do Leitor Onisciente",
            capitulo_atual: 224,
            capa: "https://placehold.co/200x280/3f3f46/9ca3af?text=ORV",
            mangaId: "leitor-onisciente",
            atualizadoEm: Date.now(),
            data: "28/06/2026"
        },
        "o-comeco-depois-do-fim": {
            titulo: "O Começo Depois do Fim",
            capitulo_atual: 241,
            capa: "https://placehold.co/200x280/3f3f46/9ca3af?text=TBATE",
            mangaId: "o-comeco-depois-do-fim",
            atualizadoEm: Date.now() - 86400000,
            data: "26/06/2026"
        }
    };
    dados.ultimaAtualizacao = new Date().toISOString();
    guardar(dados);
    return true;
}
