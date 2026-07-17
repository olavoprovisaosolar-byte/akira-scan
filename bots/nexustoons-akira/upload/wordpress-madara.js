/**
 * STUB — Upload WordPress Madara (opcional, escolha #2 do operador).
 *
 * Para sites WordPress + tema Madara, implemente aqui:
 *   - POST wp-json/wp/v2/manga
 *   - Upload de mídia via wp/v2/media
 *   - Meta _wp_manga_chapters
 *
 * Produção Akira Scan (akira-scan.pages.dev) NÃO usa este caminho.
 * Configure: NEXUSTOONS_UPLOAD_ADAPTER=wordpress-madara
 *
 * Variáveis esperadas:
 *   WP_BASE_URL, WP_USER, WP_APP_PASSWORD
 */

import { log } from "../shared/logger.js";

/** @type {import('./adapter.js').UploadAdapter} */
export function createAdapter() {
    return {
        name: "wordpress-madara",

        async uploadChapter(chapter) {
            log.warn(
                "wordpress-madara é um stub. Implemente upload Madara ou use NEXUSTOONS_UPLOAD_ADAPTER=akira-scan",
                { mangaId: chapter.mangaId, capId: chapter.capId }
            );
            return {
                ok: false,
                mangaId: chapter.mangaId,
                capId: chapter.capId,
                pagesSaved: 0,
                error: "Stub WordPress Madara — não implementado"
            };
        }
    };
}
