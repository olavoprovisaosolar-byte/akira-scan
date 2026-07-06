/**
 * Tipos compartilhados — espelham shared/types/manga.ts
 * Usar com // @ts-check nos módulos JS críticos.
 */

export interface Capitulo {
    id: string;
    numero: number;
    titulo?: string | null;
    paginas?: number;
    publicadoEm?: string;
    novo?: boolean;
}

export interface Manga {
    id: string;
    titulo: string;
    sinopse: string;
    autor: string;
    artista: string;
    generos: string[];
    status: string;
    capa: string;
    banner: string;
    popularidade: number;
    capitulos: Capitulo[];
    atualizadoEm: string;
    origem: string;
    toonlivreId?: string;
}
