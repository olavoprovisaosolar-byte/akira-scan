/**
 * Checagem de sanidade — antes de publicar na biblioteca principal.
 */
import axios from "axios";
import { CHROME_UA } from "../../infrastructure/http/secure-client.js";
import { logger } from "../../core/logger.js";
import { MANGA_FALLBACKS } from "../../shared/mangaSchema.js";
import type { IngestManga } from "./normalize.js";
import { hasRealCover, hasRealSynopsis } from "./normalize.js";

export type ReviewStatus = "published" | "pending_review";

export interface SanityResult {
    ok: boolean;
    status: ReviewStatus;
    errors: string[];
    warnings: string[];
}

const PLACEHOLDER_PATTERNS = [
    /placehold\.co/i,
    /placeholder/i,
    /no-?image/i,
    /default-cover/i,
    /error/i,
    /404/i,
    /data:image\/svg/i,
    /blank\.(jpg|png|webp)/i,
    /missing/i
];

export function isPlaceholderCover(url: string): boolean {
    if (!url || url === MANGA_FALLBACKS.coverUrl) return true;
    return PLACEHOLDER_PATTERNS.some((re) => re.test(url));
}

function resolveCoverUrl(coverUrl: string): string {
    if (coverUrl.startsWith("/api/catalogo/img?url=")) {
        try {
            const q = new URL(coverUrl, "http://local").searchParams.get("url");
            return q || coverUrl;
        } catch {
            return coverUrl;
        }
    }
    return coverUrl;
}

/** Verifica se a capa responde com imagem válida. */
export async function checkCoverAccessible(coverUrl: string): Promise<boolean> {
    const url = resolveCoverUrl(coverUrl);
    if (!url || isPlaceholderCover(url)) return false;

    try {
        const res = await axios.head(url, {
            headers: { "User-Agent": CHROME_UA },
            timeout: 12_000,
            maxRedirects: 3,
            validateStatus: (s) => s < 500
        });
        if (res.status >= 400) return false;
        const ct = String(res.headers["content-type"] || "");
        return ct.includes("image") || ct.includes("octet-stream");
    } catch {
        try {
            const res = await axios.get(url, {
                headers: { "User-Agent": CHROME_UA, Range: "bytes=0-512" },
                timeout: 12_000,
                maxRedirects: 3,
                responseType: "arraybuffer",
                validateStatus: (s) => s < 500
            });
            return res.status < 400 && (res.data as ArrayBuffer).byteLength > 100;
        } catch {
            return false;
        }
    }
}

/** Verifica se o link do capítulo responde. */
export async function checkChapterAccessible(chapterUrl: string): Promise<boolean> {
    if (!chapterUrl) return false;
    try {
        const res = await axios.get(chapterUrl, {
            headers: { "User-Agent": CHROME_UA },
            timeout: 15_000,
            maxRedirects: 3,
            validateStatus: (s) => s < 500,
            responseType: "text"
        });
        if (res.status >= 400) return false;
        const html = String(res.data);
        return html.length > 800 && /capitulo|chapter|reading-content|wp-manga/i.test(html);
    } catch {
        return false;
    }
}

export async function runSanityCheck(manga: IngestManga): Promise<SanityResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!manga.chapters.length) {
        errors.push("Sem capítulos.");
    }

    if (!hasRealCover(manga)) {
        errors.push("Capa ausente.");
    } else if (isPlaceholderCover(manga.coverUrl)) {
        errors.push("Capa é placeholder ou imagem de erro.");
    }

    if (!hasRealSynopsis(manga)) {
        warnings.push("Sinopse ausente — pending_review.");
    }

    if (hasRealCover(manga) && !isPlaceholderCover(manga.coverUrl)) {
        const coverOk = await checkCoverAccessible(manga.coverUrl);
        if (!coverOk) {
            errors.push("Capa inacessível ou inválida.");
            logger.warn("SanityCheck", "Capa inacessível", { id: manga.id, cover: manga.coverUrl });
        }
    }

    const firstChapter = manga.chapters[0];
    if (firstChapter?.url) {
        const chOk = await checkChapterAccessible(firstChapter.url);
        if (!chOk) {
            errors.push(`Capítulo ${firstChapter.number} inacessível.`);
            logger.warn("SanityCheck", "Capítulo inacessível", {
                id: manga.id,
                url: firstChapter.url
            });
        }
    }

    const needsReview = !hasRealSynopsis(manga) || !hasRealCover(manga) || errors.length > 0;
    const status: ReviewStatus = needsReview ? "pending_review" : "published";

    return {
        ok: status === "published",
        status,
        errors,
        warnings
    };
}
