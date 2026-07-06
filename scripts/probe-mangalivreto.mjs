import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://mangalivre.to";
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";

const home = await axios.get(`${BASE}/`, {
    headers: { "User-Agent": ua },
    timeout: 20000
});
const $ = cheerio.load(home.data);
const mangaLinks = [];
$("a[href*='/manga/']").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.includes("/manga/") && !mangaLinks.includes(href)) mangaLinks.push(href);
});
console.log("manga links sample:", mangaLinks.slice(0, 8));

const testUrl = mangaLinks.find((u) => /\/manga\/[^/?]+\/$/.test(u)) || `${BASE}/manga/jujutsu-kaisen-modulo/`;
console.log("\nProbing:", testUrl);
const page = await axios.get(testUrl.startsWith("http") ? testUrl : `${BASE}${testUrl}`, {
    headers: { "User-Agent": ua, Referer: `${BASE}/` },
    timeout: 20000
});
const $$ = cheerio.load(page.data);
console.log("title:", $$("h1").first().text().trim());
console.log("og:title:", $$("meta[property='og:title']").attr("content"));
console.log("og:image:", $$("meta[property='og:image']").attr("content"));
console.log("synopsis selectors:");
for (const sel of [".description", ".summary", ".sinopse", "#noidungm", ".manga-excerpt", ".post-content", ".entry-content"]) {
    const t = $$(sel).first().text().trim().slice(0, 120);
    if (t) console.log(`  ${sel}:`, t);
}
const chapters = [];
$$("a[href*='capitulo'], a[href*='chapter'], .wp-manga-chapter a, li.chapter a, .listing-chapters a").each((_, el) => {
    chapters.push({ href: $$(el).attr("href"), text: $$(el).text().trim().slice(0, 60) });
});
console.log("chapters sample:", chapters.slice(0, 5));

// Capítulo — imagens
const capUrl = chapters.find((c) => c.href?.includes("capitulo-25"))?.href;
if (capUrl) {
    const cap = await axios.get(capUrl, {
        headers: { "User-Agent": ua, Referer: testUrl },
        timeout: 20000
    });
    const $c = cheerio.load(cap.data);
    const imgs = [];
    $c(".reading-content img, .page-chapter img, .chapter-content img, .images-chapter img, img[src*='.webp'], img[src*='.jpg']").each((_, el) => {
        const src = $c(el).attr("src") || $c(el).attr("data-src");
        if (src && !/logo|avatar|banner|icon/i.test(src)) imgs.push(src);
    });
    console.log("\nchapter images:", imgs.slice(0, 4));
}
