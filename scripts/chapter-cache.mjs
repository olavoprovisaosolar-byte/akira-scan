/**
 * Busca páginas de capítulo e grava no backup local para leitura offline.
 */
import fs from "fs";
import path from "path";
import { obterPaginasCapituloServidor } from "../netlify/functions/catalogo.mjs";
import { obterCapituloPaginasBackup } from "../netlify/functions/biblioteca-local.mjs";
import { obterToken } from "../netlify/functions/toonlivre-client.mjs";

const MANGALIVRETO = "https://mangalivre.to";
const slugCache = new Map();

function lerMetaBackup(root, mangaId) {
    const p = path.join(root, "data", "toonlivre-backup", "mangas", mangaId, "meta.json");
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
        return null;
    }
}

async function resolverSlugMangalivreTo(root, mangaId) {
    if (slugCache.has(mangaId)) return slugCache.get(mangaId);

    const meta = lerMetaBackup(root, mangaId);
    const titulo = meta?.title || meta?.titulo || meta?.alternativeTitle || "";
    if (!titulo) return null;

    const q = encodeURIComponent(titulo.split("|")[0].trim());
    const res = await fetch(`${MANGALIVRETO}/?s=${q}`, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/122.0.0.0", Referer: `${MANGALIVRETO}/` }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const re = /href="(https:\/\/mangalivre\.to\/manga\/([^"/?#]+)\/?)"/gi;
    let match;
    const tituloLower = titulo.toLowerCase();
    while ((match = re.exec(html)) !== null) {
        const slug = match[2];
        const context = html.slice(Math.max(0, match.index - 200), match.index + 200).toLowerCase();
        if (context.includes(tituloLower.slice(0, 12)) || slug.replace(/-/g, " ").includes(tituloLower.slice(0, 8))) {
            slugCache.set(mangaId, slug);
            return slug;
        }
    }
    const first = html.match(/href="https:\/\/mangalivre\.to\/manga\/([^"/?#]+)\/?"/i);
    if (first?.[1]) {
        slugCache.set(mangaId, first[1]);
        return first[1];
    }
    return null;
}

async function fetchMangalivreToPages(root, mangaId, numeroCap) {
    const slug = await resolverSlugMangalivreTo(root, mangaId);
    if (!slug) return null;

    const paths = [
        `/manga/${encodeURIComponent(slug)}/capitulo-${numeroCap}/`,
        `/manga/${encodeURIComponent(slug)}/chapter-${numeroCap}/`,
        `/manga/${encodeURIComponent(slug)}/${numeroCap}/`
    ];

    for (const p of paths) {
        try {
            const res = await fetch(`${MANGALIVRETO}${p}`, {
                headers: { "User-Agent": "Mozilla/5.0 Chrome/122.0.0.0", Referer: `${MANGALIVRETO}/manga/${slug}/` },
                redirect: "follow"
            });
            if (!res.ok) continue;
            const html = await res.text();
            const urls = [...html.matchAll(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)]
                .map((m) => m[1])
                .filter((u) => /^https?:\/\//i.test(u) && /\.(webp|jpg|jpeg|png)(\?|$)/i.test(u))
                .filter((u) => !/logo|avatar|banner|icon|ads/i.test(u));
            const unique = [...new Set(urls)];
            if (unique.length >= 2) return unique;
        } catch { /* próximo path */ }
    }
    return null;
}

const PAGE_EXT = /\.(webp|jpg|jpeg|png|gif)$/i;

function extFromUrl(url, contentType = "") {
    if (contentType.includes("webp")) return ".webp";
    if (contentType.includes("png")) return ".png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
    const m = String(url).match(/\.(webp|png|jpe?g|gif)(\?|$)/i);
    return m ? `.${m[1].toLowerCase().replace("jpeg", "jpg")}` : ".webp";
}

async function downloadPage(url, destPath, referer) {
    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 200) {
        return fs.statSync(destPath).size;
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const token = await obterToken();
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
            Referer: referer,
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            [token.header]: token.value
        },
        redirect: "follow"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return buf.length;
}

async function fetchViaPlaywright(mangaId, numeroCap) {
    try {
        const { chromium } = await import("playwright");
        const launchOpts = {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        };
        let browser;
        try {
            browser = await chromium.launch(launchOpts);
        } catch {
            browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
        }
        const page = await browser.newPage({
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
            locale: "pt-BR"
        });
        const urls = [];

        page.on("response", async (res) => {
            const u = res.url();
            if (u.includes("/api/mangas/") && u.includes("/chapters/")) {
                try {
                    const json = await res.json();
                    if (json.pages?.length) {
                        for (const p of json.pages) urls.push(typeof p === "string" ? p : p?.url);
                    }
                } catch { /* ignore */ }
            } else if (/\.(webp|jpg|jpeg|png)(\?|$)/i.test(u) && res.status() === 200) {
                urls.push(u);
            }
        });        await page.goto("https://toonlivre.net/", { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2000);

        const chapterUrl = `https://toonlivre.net/${encodeURIComponent(mangaId)}/${encodeURIComponent(numeroCap)}`;
        await page.goto(chapterUrl, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
        await page.waitForTimeout(3500);

        const domUrls = await page.evaluate(() =>
            [...document.querySelectorAll("img, picture source")]
                .map((el) => el.src || el.getAttribute("data-src") || el.getAttribute("srcset")?.split(" ")[0])
                .filter((u) => u && /^https?:\/\//.test(u) && /\.(webp|jpg|jpeg|png)/i.test(u))
        );

        await browser.close();
        const unique = [...new Set([...urls, ...domUrls])].filter((u) => u && !/logo|avatar|banner|404|widget/i.test(u));
        return unique.length >= 2 ? unique : null;
    } catch (e) {
        console.warn("[ChapterCache] Playwright:", e.message);
        return null;
    }
}

async function fetchRemotePages(root, mangaId, capituloId, numeroCap) {
    try {
        const pages = await obterPaginasCapituloServidor(mangaId, capituloId, String(numeroCap));
        if (pages?.length >= 1) return pages;
    } catch (e) {
        console.warn("[ChapterCache] ToonLivre:", e.message);
    }

    if (process.env.SCRAPER_ENGINE === "playwright" || process.env.BACKUP_USE_PLAYWRIGHT !== "0") {
        const pw = await fetchViaPlaywright(mangaId, numeroCap);
        if (pw?.length) return pw;
    }

    try {
        const mlto = await fetchMangalivreToPages(root, mangaId, numeroCap);
        if (mlto?.length) return mlto;
    } catch (e) {
        console.warn("[ChapterCache] MangaLivreTo:", e.message);
    }

    try {
        const handler = (await import("../dist/server/proxy/handler.js")).default;
        const req = new Request(
            `http://127.0.0.1/api/v1/proxy/manga/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(capituloId)}?n=${encodeURIComponent(numeroCap)}&source=mangalivreto`
        );
        const res = await handler(req);
        const data = await res.json();
        if (data.pages?.length) {
            return data.pages.map((p) => (typeof p === "string" ? p : p.url)).filter(Boolean);
        }
    } catch (e) {
        console.warn("[ChapterCache] Proxy:", e.message);
    }

    return null;
}

/**
 * @returns {Array<{index:number,url:string}>|null}
 */
export async function obterOuCachearCapitulo(root, mangaId, capituloId, numeroCap = null) {
    const local = obterCapituloPaginasBackup(root, mangaId, capituloId);
    if (local?.length) return local;

    let num = numeroCap;
    if (!num) {
        const tail = String(capituloId).match(/-(\d+(?:\.\d+)?)$/);
        num = tail ? tail[1] : capituloId.replace(/\D/g, "") || "1";
    }

    const remote = await fetchRemotePages(root, mangaId, capituloId, num);
    if (!remote?.length) return null;

    const capDir = path.join(root, "data", "toonlivre-backup", "mangas", mangaId, "chapters", capituloId, "pages");
    fs.mkdirSync(capDir, { recursive: true });
    const referer = `https://toonlivre.net/${mangaId}/${num}`;

    for (let i = 0; i < remote.length; i++) {
        let url = remote[i];
        if (typeof url === "object" && url?.url) url = url.url;
        if (!url || !String(url).startsWith("http")) continue;
        const ext = extFromUrl(url);
        const file = `${String(i + 1).padStart(3, "0")}${ext}`;
        try {
            await downloadPage(url, path.join(capDir, file), referer);
        } catch (e) {
            console.warn(`[ChapterCache] página ${i + 1}:`, e.message);
        }
    }

    const cached = obterCapituloPaginasBackup(root, mangaId, capituloId);
    if (cached?.length) {
        fs.writeFileSync(
            path.join(path.dirname(capDir), "meta.json"),
            JSON.stringify({ id: capituloId, numero: Number(num), pages: cached.length, cachedAt: new Date().toISOString() }, null, 2)
        );
    }
    return cached;
}

export function listarPaginasBackup(root, mangaId, capituloId) {
    return obterCapituloPaginasBackup(root, mangaId, capituloId);
}
