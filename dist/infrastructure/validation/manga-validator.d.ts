import type { MangaCanonical } from "../../shared/schema.js";
export interface ValidationResult {
    ok: boolean;
    errors: string[];
}
export declare function validateMangaCanonical(data: unknown, expectedId?: string): ValidationResult;
/** Lança se inválido — impede corrupção no Firestore. */
export declare function assertValidManga(data: MangaCanonical, expectedId?: string): void;
