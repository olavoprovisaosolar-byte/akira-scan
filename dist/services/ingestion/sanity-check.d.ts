import type { IngestManga } from "./normalize.js";
export type ReviewStatus = "published" | "pending_review";
export interface SanityResult {
    ok: boolean;
    status: ReviewStatus;
    errors: string[];
    warnings: string[];
}
export declare function isPlaceholderCover(url: string): boolean;
/** Verifica se a capa responde com imagem válida. */
export declare function checkCoverAccessible(coverUrl: string): Promise<boolean>;
/** Verifica se o link do capítulo responde. */
export declare function checkChapterAccessible(chapterUrl: string): Promise<boolean>;
export declare function runSanityCheck(manga: IngestManga): Promise<SanityResult>;
