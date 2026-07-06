import { obterPaginasCapituloServidor } from "../netlify/functions/catalogo.mjs";

const BASE = "https://toonlivre.net";
const mangaId = "obra-69466adb";
const cap = "35";

const referer = `${BASE}/${mangaId}/${cap}`;
const res = await fetch(referer, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8"
    },
    redirect: "follow"
});
const html = await res.text();
console.log("Status:", res.status, "URL:", res.url, "Len:", html.length);
console.log("Has pages JSON:", /"pages"\s*:/.test(html));
console.log("Has cdn:", /cdn\.toonlivre/.test(html));
const imgs = [...html.matchAll(/https?:\/\/[^"'\s]+\.(?:webp|jpg|jpeg|png)/gi)].map(m => m[0]);
console.log("Image URLs found:", imgs.length, imgs.slice(0, 3));

try {
    const pages = await obterPaginasCapituloServidor(mangaId, "cap-d501f6c4-35", cap);
    console.log("Server pages:", pages.length);
} catch (e) {
    console.log("Server err:", e.message);
}
