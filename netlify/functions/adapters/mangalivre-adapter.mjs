/**
 * MangaLivre Adapter — scraping via Cheerio (sem API pública conhecida).
 */
import * as cheerio from "cheerio";
import { BaseAdapter } from "./base-adapter.mjs";
import { browserHeaders } from "../lib/user-agent.mjs";
import { withRetry } from "../lib/retry.mjs";

const BASE = process.env.MANGALIVRE_BASE_URL || "https://mangalivre.net";

export class MangaLivreAdapter extends BaseAdapter {
    name = "mangalivre";

    async fetchManga(mangaId) {
        return withRetry(() => this._scrapeManga(mangaId), {
            label: `mangalivre:manga:${mangaId}`
        });
    }

    async fetchChapterPages(mangaId, chapterId, numeroCap) {
        const num = numeroCap || chapterId.replace(/\D/g, "") || "1";
        return withRetry(() => this._scrapeChapter(mangaId, num), {
            label: `mangalivre:cap:${mangaId}:${num}`
        });
    }

    async _fetchHtml(urlPath) {
        const res = await fetch(`${BASE}${urlPath}`, { headers: browserHeaders(BASE) });
        if (!res.ok) throw new Error(`MangaLivre HTTP ${res.status}`);
        return cheerio.load(await res.text());
    }

    async _scrapeManga(mangaId) {
        const $ = await this._fetchHtml(`/manga/${encodeURIComponent(mangaId)}`);

        const titulo = $("h1, .post-title h1, .manga-title").first().text().trim() || mangaId;
        const sinopse = $(".description, .summary, .sinopse, #noidungm").first().text().trim();
        let capa = $("meta[property='og:image']").attr("content")
            || $(".summary_image img, .thumb img, .manga-poster img").first().attr("src") || "";

        if (capa && !capa.startsWith("http")) capa = `${BASE}${capa}`;

        const capitulos = [];
        const seen = new Set();

        $("a[href*='/capitulo'], a[href*='/chapter'], .wp-manga-chapter a, li.chapter a").each((_, el) => {
            const href = $(el).attr("href") || "";
            const text = $(el).text().trim();
            const numMatch = text.match(/(\d+(?:\.\d+)?)/) || href.match(/(\d+(?:\.\d+)?)/);
            if (!numMatch) return;
            const numero = Number(numMatch[1]);
            const id = `cap-${numero}`;
            if (seen.has(id)) return;
            seen.add(id);
            capitulos.push({
                id,
                numero,
                titulo: text || `Capítulo ${numero}`,
                paginas: 0,
                publicadoEm: new Date().toISOString()
            });
        });

        capitulos.sort((a, b) => b.numero - a.numero);

        if (!capitulos.length) {
            console.error("[MangaLivreAdapter] Layout possivelmente alterado — zero capítulos.");
        }

        const capaProxy = capa ? `/api/catalogo/img?url=${encodeURIComponent(capa)}` : "";

        return {
            id: mangaId,
            titulo,
            sinopse: sinopse || "Sem sinopse disponível.",
            autor: "",
            artista: "",
            generos: [],
            status: "Em lançamento",
            capa: capaProxy,
            banner: capaProxy,
            popularidade: 50,
            capitulos,
            atualizadoEm: new Date().toISOString(),
            origem: "mangalivre"
        };
    }

    async _scrapeChapter(mangaId, numeroCap) {
        const paths = [
            `/manga/${encodeURIComponent(mangaId)}/capitulo-${numeroCap}`,
            `/manga/${encodeURIComponent(mangaId)}/chapter-${numeroCap}`,
            `/${encodeURIComponent(mangaId)}/${numeroCap}`
        ];

        let $ = null;
        for (const p of paths) {
            try {
                $ = await this._fetchHtml(p);
                if ($("img").length > 2) break;
            } catch { /* tenta próximo */ }
        }
        if (!$) throw new Error("Capítulo MangaLivre não encontrado.");

        const urls = [];
        const seen = new Set();

        $(".reading-content img, .page-chapter img, .chapter-content img, img[src*='.webp'], img[src*='.jpg']").each((_, el) => {
            let src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src") || "";
            src = src.trim();
            if (!src || src.includes("logo") || src.includes("avatar") || src.includes("banner")) return;
            if (!src.startsWith("http")) src = src.startsWith("/") ? `${BASE}${src}` : `${BASE}/${src}`;
            if (src.includes("netassets") || /\/covers?\//i.test(src)) return;
            if (seen.has(src)) return;
            seen.add(src);
            urls.push(src);
        });

        if (!urls.length) {
            throw new Error("Layout MangaLivre alterado — nenhuma imagem no capítulo.");
        }
        return urls;
    }
}
