/**
 * Utilitários de capítulo — parsing e validação anti-Cap.501.
 */
export interface ChapterRef {
    id: string;
    number: number;
    title: string | null;
    url: string;
}
/** Extrai número do capítulo sem concatenar dígitos do UUID (bug Cap.501). */
export declare function parseChapterNumber(cap: {
    id?: string;
    numero?: number;
    number?: number;
    titulo?: string | null;
    title?: string | null;
    url?: string;
}): number;
/** Detecta listas corrompidas (todos Cap. 501, números duplicados em massa). */
export declare function validateChapterList(chapters: ChapterRef[]): {
    ok: boolean;
    error?: string;
};
/** Divide array em lotes (persistência incremental). */
export declare function batchChapters<T>(items: T[], batchSize?: number): T[][];
