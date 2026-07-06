/** Resolve URL relativa contra uma base (evita `https://hostpath` sem barra). */
export declare function resolveAbsoluteUrl(base: string, path: string): string;
/** Detecta URLs de capítulo inválidas (capa, link quebrado, thumbnail). */
export declare function isValidChapterImageUrl(url: string): boolean;
export declare function validateChapterPages(pages: {
    url?: string;
}[]): boolean;
