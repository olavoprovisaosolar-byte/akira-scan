/**
 * ToonLivre Adapter — API oficial (contrato).
 * Scraping HTML só como último recurso.
 */
import { BaseAdapter } from "./base-adapter.mjs";
import {
    obterMangaPorSlug,
    normalizarMangaRemoto
} from "../toonlivre-client.mjs";
import { obterPaginasCapituloServidor } from "../catalogo.mjs";
import { withRetry } from "../lib/retry.mjs";
import * as cheerio from "cheerio";
import { browserHeaders } from "../lib/user-agent.mjs";

export class ToonLivreAdapter extends BaseAdapter {
    name = "toonlivre";

    async fetchManga(mangaId) {
        return withRetry(async () => {
            try {
                const raw = await obterMangaPorSlug(mangaId);
                return normalizarMangaRemoto(raw, "/api/catalogo");
            } catch (apiErr) {
                console.warn("[ToonLivreAdapter] API falhou, fallback HTML:", apiErr.message);
                return this._scrapeMangaHtml(mangaId);
            }
        }, { label: `toonlivre:manga:${mangaId}` });
    }

    async fetchChapterPages(mangaId, chapterId, numeroCap, clientHeaders = {}) {
        return withRetry(async () => {
            const pages = await obterPaginasCapituloServidor(
                mangaId, chapterId, numeroCap, clientHeaders
            );
            if (pages?.length) return pages;
            throw new Error("Capítulo ToonLivre sem páginas.");
        }, { label: `toonlivre:cap:${mangaId}:${chapterId}` });
    }

    async _scrapeMangaHtml(mangaId) {
        const base = process.env.TOONLIVRE_BASE_URL || "https://toonlivre.net";
        const res = await fetch(`${base}/${encodeURIComponent(mangaId)}`, {
            headers: browserHeaders(base)
        });
        if (!res.ok) throw new Error(`ToonLivre HTML ${res.status}`);
        const $ = cheerio.load(await res.text());
        const titulo = $("h1").first().text().trim() || mangaId;
        const sinopse = $(".description, [class*='description'], .sinopse").first().text().trim();
        const capa = $("img[src*='cover'], .cover img, meta[property='og:image']").first().attr("src")
            || $("meta[property='og:image']").attr("content") || "";

        const capitulos = [];
        $("a[href*='/']").each((_, el) => {
            const href = $(el).attr("href") || "";
            const m = href.match(new RegExp(`${mangaId}/(\\d+)`));
            if (m) {
                capitulos.push({
                    id: `cap-${m[1]}`,
                    numero: Number(m[1]),
                    titulo: $(el).text().trim() || null,
                    paginas: 0,
                    publicadoEm: new Date().toISOString()
                });
            }
        });

        return normalizarMangaRemoto({
            id: mangaId,
            title: titulo,
            description: sinopse,
            coverUrl: capa.startsWith("http") ? capa : `${base}${capa}`,
            chapters: capitulos.slice(0, 500)
        }, "/api/catalogo");
    }

    async _scrapeChapterHtml(mangaId, numeroCap) {
        const base = process.env.TOONLIVRE_BASE_URL || "https://toonlivre.net";
        const url = `${base}/${encodeURIComponent(mangaId)}/${encodeURIComponent(numeroCap)}`;
        const res = await fetch(url, { headers: browserHeaders(base) });
        if (!res.ok) throw new Error(`ToonLivre cap HTML ${res.status}`);
        const html = await res.text();

        const jsonMatch = html.match(/"pages"\s*:\s*(\[[^\]]+\])/);
        if (jsonMatch) {
            try {
                const pages = JSON.parse(jsonMatch[1].replace(/\\"/g, '"'));
                if (Array.isArray(pages) && pages.length) return pages;
            } catch { /* continua */ }
        }

        const $ = cheerio.load(html);
        const urls = [];
        $("img[src*='.webp'], img[src*='.jpg'], img[src*='.png']").each((_, el) => {
            const src = $(el).attr("src") || $(el).attr("data-src");
            if (src && !src.includes("logo") && !src.includes("avatar")) {
                urls.push(src.startsWith("http") ? src : `${base}${src}`);
            }
        });
        if (!urls.length) throw new Error("Layout ToonLivre alterado — nenhuma página encontrada.");
        return urls;
    }
}
