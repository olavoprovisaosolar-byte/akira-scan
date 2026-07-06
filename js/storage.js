/**
 * AkiraScan — Favoritos, histórico e continuar lendo (localStorage).
 */
import { normalizarNumeroProgresso } from "./services/chapter-label.js";

const STORAGE_KEY = "akirascan_v2";

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
