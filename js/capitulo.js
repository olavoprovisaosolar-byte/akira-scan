/**
 * Carregamento de páginas — cache em memória apenas durante a aba aberta.
 */
import { obterPaginasLeitura as carregarPaginas } from "./services/data-service.js";

const cacheAba = new Map();

export function parseLeitorUrl(searchParams) {
    return {
        mangaId: searchParams.get("id") || searchParams.get("m"),
        cap: searchParams.get("n") || searchParams.get("cap"),
        chapterId: searchParams.get("ch") || searchParams.get("chapterId")
    };
}

export async function obterPaginasLeitura(mangaId, numeroCap, chapterId = null) {
    const chave = `${mangaId}:${numeroCap}:${chapterId || ""}`;

    if (cacheAba.has(chave)) {
        return cacheAba.get(chave);
    }

    const paginas = await carregarPaginas(mangaId, numeroCap, chapterId);
    cacheAba.set(chave, paginas);
    return paginas;
}
