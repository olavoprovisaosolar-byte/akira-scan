/**
 * Dados de utilizador — delega para storage.js (sync via Netlify Blobs).
 */
import {
    alternarFavorito as alternarFavoritoStorage,
    salvarProgresso as salvarProgressoStorage,
    criarHistoricoDemonstracao,
    sincronizarComNuvem,
    obterFavoritos,
    obterHistorico
} from "./storage.js";
import { usuarioAtual } from "./auth.js";

export { criarHistoricoDemonstracao, sincronizarComNuvem };

export async function obterDadosUsuario(userId) {
    await sincronizarComNuvem();
    return {
        favoritos: obterFavoritos(),
        historico_leitura: obterHistorico()
    };
}

export async function salvarProgresso(userId, manhwaId, numeroCapitulo, extras = {}) {
    salvarProgressoStorage(manhwaId, {
        titulo: extras.titulo,
        capitulo_atual: numeroCapitulo,
        capa: extras.capa,
        chapterId: extras.chapterId,
        data: extras.data || new Date().toLocaleDateString("pt-BR")
    });
}

export async function alternarFavorito(userId, manhwaId) {
    return alternarFavoritoStorage(manhwaId);
}

export function utilizadorLogado() {
    return usuarioAtual();
}
