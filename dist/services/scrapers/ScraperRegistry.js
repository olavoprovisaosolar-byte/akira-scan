/**
 * ScraperRegistry — failover A→B→C→D→E com validação de capítulos.
 */
import { MangaLivreScraper } from "./MangaLivreAdapter.js";
import { ToonLivreScraper } from "./ToonLivreAdapter.js";
import { MangaLivreToScraper } from "./MangaLivreToAdapter.js";
import { MangaLivreBlogScraper } from "./MangaLivreBlogAdapter.js";
import { BladeToonsScraper } from "./BladeToonsAdapter.js";
import { logger } from "../../core/logger.js";
import { fetchText } from "../../infrastructure/http/secure-client.js";
import { validateChapterList, parseChapterNumber } from "../../shared/chapter-utils.js";
import { validateChapterPages } from "../../shared/url-utils.js";
export const PROVIDER_ORDER = [
    "toonlivre",
    "mangalivre",
    "mangalivreto",
    "mangalivreblog",
    "bladetoons"
];
const scrapers = {
    toonlivre: new ToonLivreScraper(),
    mangalivre: new MangaLivreScraper(),
    mangalivreto: new MangaLivreToScraper(),
    mangalivreblog: new MangaLivreBlogScraper(),
    bladetoons: new BladeToonsScraper()
};
function resolveOrder(preferred, mangaId) {
    if (preferred !== "auto") {
        const p = preferred;
        if (scrapers[p])
            return [p, ...PROVIDER_ORDER.filter((x) => x !== p)];
        return [...PROVIDER_ORDER];
    }
    if (/^obra-/i.test(mangaId))
        return ["toonlivre", "mangalivre", "mangalivreto", "mangalivreblog", "bladetoons"];
    return ["mangalivreto", "mangalivreblog", "toonlivre", "mangalivre", "bladetoons"];
}
function validateMangaPayload(manga) {
    if (!manga?.titulo && !manga?.capitulos?.length) {
        return { ok: false, error: "dados vazios" };
    }
    if (!manga.capitulos?.length) {
        return manga.titulo && manga.capa ? { ok: true } : { ok: false, error: "sem capítulos" };
    }
    const refs = manga.capitulos.map((c) => ({
        id: c.id,
        number: parseChapterNumber(c),
        title: c.titulo ?? null,
        url: ""
    }));
    return validateChapterList(refs);
}
function isValidMangaData(manga) {
    return validateMangaPayload(manga).ok;
}
export async function fetchMangaWithFailover(mangaId, preferred = "auto") {
    const order = resolveOrder(preferred, mangaId);
    const attempts = [];
    for (const name of order) {
        const scraper = scrapers[name];
        if (!scraper)
            continue;
        const isFallback = name === "mangalivreto" || name === "mangalivreblog" || name === "bladetoons";
        logger.info("ScraperRegistry", isFallback
            ? `Failover → ${name}`
            : `Tentativa provedor ${name}`, { mangaId });
        try {
            const manga = await scraper.fetchManga(mangaId);
            const validation = validateMangaPayload(manga);
            if (validation.ok && (manga?.capitulos?.length || manga?.titulo)) {
                attempts.push({ provider: name, ok: true });
                logger.info("ScraperRegistry", `Sucesso via ${name}`, {
                    mangaId,
                    caps: manga.capitulos?.length ?? 0
                });
                return { manga, source: name, attempts };
            }
            const err = validation.error || "dados vazios ou corrompidos";
            attempts.push({ provider: name, ok: false, empty: true, error: err });
            logger.warn("ScraperRegistry", `${name} payload inválido — descartado`, { mangaId, err });
        }
        catch (e) {
            const msg = e.message;
            attempts.push({ provider: name, ok: false, error: msg });
            logger.warn("ScraperRegistry", `${name} falhou`, { mangaId, msg });
        }
    }
    throw new Error(attempts.map((a) => `${a.provider}: ${a.error || "vazio"}`).join(" | ")
        || "Nenhum provedor disponível.");
}
export async function fetchMangaAuto(mangaId, preferred = "auto") {
    const { manga, source } = await fetchMangaWithFailover(mangaId, preferred);
    return { manga, source };
}
export async function fetchChapterAuto(mangaId, chapterId, numeroCap, preferred = "auto", clientHeaders = {}) {
    const order = resolveOrder(preferred, mangaId);
    const errors = [];
    for (const name of order) {
        const scraper = scrapers[name];
        if (!scraper)
            continue;
        try {
            const urls = await scraper.fetchChapterPages(mangaId, chapterId, numeroCap, clientHeaders);
            if (urls?.length) {
                const pages = scraper.normalizePages(urls);
                if (validateChapterPages(pages)) {
                    return { pages, source: name };
                }
                errors.push(`${name}: páginas inválidas (${pages.length} URLs rejeitadas)`);
                logger.warn("ScraperRegistry", `${name} capítulo rejeitado — URLs inválidas`, { mangaId, chapterId });
            }
        }
        catch (e) {
            errors.push(`${name}: ${e.message}`);
            logger.warn("ScraperRegistry", `${name} capítulo falhou`, { mangaId, chapterId, msg: e.message });
        }
    }
    throw new Error(errors.join(" | ") || "Capítulo indisponível.");
}
export async function healthCheckProviders() {
    const ml = await fetchText(`${process.env.MANGALIVRE_BASE_URL || "https://mangalivre.net"}/`, { referer: "" })
        .then((h) => h.length > 1000)
        .catch(() => false);
    const tl = await scrapers.toonlivre.ping();
    const mlto = await scrapers.mangalivreto.ping();
    const mlb = await scrapers.mangalivreblog.ping();
    const bt = await scrapers.bladetoons.ping();
    return { toonlivre: tl, mangalivre: ml, mangalivreto: mlto, mangalivreblog: mlb, bladetoons: bt };
}
export { scrapers };
