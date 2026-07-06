/**
 * Schema de categorias e fallbacks — fonte única para UI e normalização.
 */
export interface MangaCategory {
    id: string;
    label: string;
    icon: string;
    /** Gêneros que mapeiam para esta categoria (PT/EN) */
    genres: string[];
    /** Máximo de cards no grid da home */
    gridLimit: number;
}
export declare const MANGA_FALLBACKS: {
    readonly title: "Título não disponível";
    readonly description: "Sinopse não disponível.";
    readonly bannerUrl: "";
    readonly coverUrl: "";
    readonly genre: "Geral";
    readonly status: "Em lançamento";
    readonly author: "";
};
export declare const MANGA_CATEGORIES: MangaCategory[];
/** Resolve categoria principal de um mangá pelo gênero. */
export declare function categoryForGenres(generos?: string[]): MangaCategory | null;
export declare function categoryById(id: string): MangaCategory | undefined;
