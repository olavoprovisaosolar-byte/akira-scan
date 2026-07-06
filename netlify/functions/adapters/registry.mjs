import { ToonLivreAdapter } from "./toonlivre-adapter.mjs";
import { MangaLivreAdapter } from "./mangalivre-adapter.mjs";

const adapters = {
    toonlivre: new ToonLivreAdapter(),
    mangalivre: new MangaLivreAdapter()
};

export function getAdapter(source) {
    if (source && adapters[source]) return adapters[source];
    return null;
}

/** auto: ToonLivre (oficial) → MangaLivre (exceto IDs obra-* ToonLivre) */
function resolveOrder(preferred, mangaId) {
    if (preferred !== "auto") return [preferred];
    const isToonLivreId = /^obra-/i.test(mangaId);
    return isToonLivreId ? ["toonlivre"] : ["toonlivre", "mangalivre"];
}

export async function fetchMangaAuto(mangaId, preferred = "auto") {
    const order = resolveOrder(preferred, mangaId);

    const errors = [];
    for (const name of order) {
        const adapter = adapters[name];
        if (!adapter) continue;
        try {
            const manga = await adapter.fetchManga(mangaId);
            if (manga?.capitulos?.length || manga?.titulo) {
                return { manga, source: name };
            }
        } catch (e) {
            errors.push(`${name}: ${e.message}`);
            console.error(`[Registry] ${name} falhou:`, e.message);
        }
    }
    throw new Error(errors.join(" | ") || "Nenhum provedor disponível.");
}

export async function fetchChapterAuto(mangaId, chapterId, numeroCap, preferred = "auto", clientHeaders = {}) {
    const order = resolveOrder(preferred, mangaId);

    const errors = [];
    for (const name of order) {
        const adapter = adapters[name];
        if (!adapter) continue;
        try {
            const urls = await adapter.fetchChapterPages(mangaId, chapterId, numeroCap, clientHeaders);
            if (urls?.length) {
                const pages = adapter.normalizePages(urls);
                return { pages, source: name };
            }
        } catch (e) {
            errors.push(`${name}: ${e.message}`);
            console.error(`[Registry] cap ${name}:`, e.message);
        }
    }
    throw new Error(errors.join(" | ") || "Capítulo indisponível.");
}

export { adapters };
