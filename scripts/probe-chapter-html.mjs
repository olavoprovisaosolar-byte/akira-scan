import { obterToken } from "../netlify/functions/toonlivre-client.mjs";

const mangaId = "obra-69466adb";
const num = "35";
const BASE = "https://toonlivre.net";
const token = await obterToken(true);
const url = `${BASE}/${mangaId}/${num}`;
const res = await fetch(url, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        Referer: `${BASE}/`,
        Accept: "text/html,application/xhtml+xml",
        [token.header]: token.value
    },
    redirect: "manual"
});
console.log("status", res.status, "location", res.headers.get("location"));
if (res.status >= 300 && res.status < 400) process.exit(0);
const html = await res.text();
const pagesJson = html.match(/"pages"\s*:\s*(\[[\s\S]*?\])/);
const cdnUrls = [...html.matchAll(/https:\/\/cdn[^"'\s]+\.(?:webp|jpg|jpeg|png)/gi)].map((m) => m[0]);
console.log("pagesJson", pagesJson ? pagesJson[1].slice(0, 120) : "none");
console.log("cdnUrls", cdnUrls.length, cdnUrls.slice(0, 3));
if (html.includes("Acesso negado")) console.log("BLOCKED in HTML");
