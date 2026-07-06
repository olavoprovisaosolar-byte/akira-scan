import axios from "axios";
import * as cheerio from "cheerio";

const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";

async function probeMlbManga() {
    const url = "https://mangalivre.blog/manga/";
    const r = await axios.get(url, { headers: { "User-Agent": ua }, timeout: 20000 });
    const $ = cheerio.load(r.data);
    const links = new Set();
    $("a[href]").each((_, el) => {
        const h = $(el).attr("href") || "";
        if (/mangalivre\.blog\/manga\/[^/]+/i.test(h) && !h.endsWith("/manga/")) links.add(h);
    });
    console.log("mlb manga links:", [...links].slice(0, 10));
    const test = [...links].find((u) => /\/manga\/[^/]+\/?$/.test(u));
    if (test) {
        const p = await axios.get(test, { headers: { "User-Agent": ua } });
        const $$ = cheerio.load(p.data);
        const ch = [];
        $$("a[href*='capitulo'], a[href*='chapter'], a[href*='/cap-']").each((_, el) => {
            if (ch.length < 6) ch.push({ h: $$(el).attr("href"), t: $$(el).text().trim().slice(0, 40) });
        });
        console.log("mlb detail:", test, "chapters:", ch);
    }
    // API probe
    try {
        const api = await axios.get("https://mangalivre.blog/wp-json/slimeread/v1/mangas?page=1", {
            headers: { "User-Agent": ua, Accept: "application/json" }
        });
        console.log("slimeread api keys:", Object.keys(api.data || {}));
        const list = api.data?.data || api.data?.mangas || api.data;
        if (Array.isArray(list)) console.log("api sample:", list[0]);
    } catch (e) {
        console.log("api err:", e.message);
    }
}

async function probeBlade() {
    const r = await axios.get("https://bladetoons.com/", { headers: { "User-Agent": ua } });
    const html = String(r.data);
    const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextData) {
        const data = JSON.parse(nextData[1]);
        console.log("bladetoons next keys:", Object.keys(data?.props?.pageProps || {}));
        console.log("sample:", JSON.stringify(data?.props?.pageProps).slice(0, 500));
    } else {
        console.log("no __NEXT_DATA__");
    }
}

await probeMlbManga();
await probeBlade();
