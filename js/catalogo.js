/**
 * Facade pública — reexporta Data Service (compatibilidade).
 */
export {
    obterCatalogoCompleto,
    obterManga,
    obterCapaManga,
    listarMangas,
    obterPopulares,
    obterRankingSemanal,
    obterCapsRecentes,
    obterSugestoesBusca,
    obterPaginasLeitura,
    invalidarCacheCatalogo,
    linkLeitor,
    linkManhwa,
    linkContinuar,
    numeroCapituloLabel,
    ordenar,
    obterFonteDados
} from "./services/data-service.js";
