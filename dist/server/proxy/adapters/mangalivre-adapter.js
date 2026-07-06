/**
 * MangaLivre Adapter — scraping Cheerio + axios.
 */
import * as cheerio from "cheerio";
import { BaseAdapter } from "./base-adapter.js";
import { fetchText } from "../http-client.js";
import { withRetry } from "../retry.js";
const BASE = process.env.MANGALIVRE_BASE_URL || "https://mangalivre.net";
export class MangaLivreAdapter extends BaseAdapter {
    name = "mangalivre";
    async fetchManga(mangaId) {
        return withRetry(() => this.scrapeManga(mangaId), {
            label: `mangalivre:manga:${mangaId}`
        });
    }
    async fetchChapterPages(mangaId, _chapterId, numeroCap) {
        const num = numeroCap || "1";
        return withRetry(() => this.scrapeChapter(mangaId, num), {
            label: `mangalivre:cap:${mangaId}:${num}`
        });
    }
    async loadHtml(urlPath) {
        const html = await fetchText(`${BASE}${urlPath}`, BASE);
        return cheerio.load(html);
    }
    async scrapeManga(mangaId) {
        const $ = await this.loadHtml(`/manga/${encodeURIComponent(mangaId)}`);
        const titulo = $("h1, .post-title h1, .manga-title").first().text().trim() || mangaId;
        const sinopse = $(".description, .summary, .sinopse, #noidungm").first().text().trim();
        let capa = $("meta[property='og:image']").attr("content")
            || $(".summary_image img, .thumb img, .manga-poster img").first().attr("src") || "";
        if (capa && !capa.startsWith("http"))
            capa = `${BASE}${capa}`;
        const capitulos = [];
        const seen = new Set();
        $("a[href*='/capitulo'], a[href*='/chapter'], .wp-manga-chapter a, li.chapter a").each((_, el) => {
            const href = $(el).attr("href") || "";
            const text = $(el).text().trim();
            const numMatch = text.match(/(\d+(?:\.\d+)?)/) || href.match(/(\d+(?:\.\d+)?)/);
            if (!numMatch)
                return;
            const numero = Number(numMatch[1]);
            const id = `cap-${numero}`;
            if (seen.has(id))
                return;
            seen.add(id);
            capitulos.push({
                id,
                numero,
                titulo: text || `Capítulo ${numero}`,
                paginas: 0
            });
        });
        capitulos.sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0));
        if (!capitulos.length) {
            console.error("[MangaLivreAdapter] Layout possivelmente alterado — zero capítulos.");
        }
        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";
        return {
            id: mangaId,
            titulo,
            sinopse: sinopse || "Sem sinopse disponível.",
            capa: capaProxy,
            banner: capaProxy,
            generos: [],
            status: "Em lançamento",
            capitulos,
            origem: "mangalivre"
        };
    }
    async scrapeChapter(mangaId, numeroCap) {
        const paths = [
            `/manga/${encodeURIComponent(mangaId)}/capitulo-${numeroCap}`,
            `/manga/${encodeURIComponent(mangaId)}/chapter-${numeroCap}`,
            `/${encodeURIComponent(mangaId)}/${numeroCap}`
        ];
        let $ = null;
        for (const p of paths) {
            try {
                $ = await this.loadHtml(p);
                if ($("img").length > 2)
                    break;
            }
            catch { /* próximo path */ }
        }
        if (!$)
            throw new Error("Capítulo MangaLivre não encontrado.");
        const urls = [];
        const seen = new Set();
        $(".reading-content img, .page-chapter img, .chapter-content img, img[src*='.webp'], img[src*='.jpg']").each((_, el) => {
            let src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
            if (!src || /logo|avatar|banner/i.test(src))
                return;
            if (!src.startsWith("http"))
                src = `${BASE}${src}`;
            if (seen.has(src))
                return;
            seen.add(src);
            urls.push(src);
        });
        if (!urls.length) {
            throw new Error("Layout MangaLivre alterado — nenhuma imagem no capítulo.");
        }
        return urls;
    }
}
