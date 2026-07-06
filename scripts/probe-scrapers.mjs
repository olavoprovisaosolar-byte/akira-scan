import axios from "axios";
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const client = axios.create({
    headers: { "User-Agent": ua, "Accept-Language": "pt-BR" },
    timeout: 20000,
    maxRedirects: 0,
    validateStatus: (s) => s < 500
});

const toon = await client.get("https://toonlivre.net/api/mangas/search?page=1&limit=1&sortBy=popular&sortOrder=desc", {
    headers: { "x-tly-sec": "web-z99", Accept: "application/json" }
});
console.log("toon", toon.status, toon.headers.location, String(toon.data).slice(0, 200));

const ml = await axios.get("https://mangalivre.net/manga/naruto", {
    headers: { "User-Agent": ua },
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true
});
const html = String(ml.data);
console.log("ml", ml.status, ml.request?.res?.responseUrl || ml.config.url, html.length);
console.log("sample", html.slice(0, 500));
