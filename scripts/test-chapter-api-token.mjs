const BASE = "https://toonlivre.net";
const mangaId = "obra-69466adb";
const cap = "35";
const chapterId = "cap-d501f6c4-35";
const referer = `${BASE}/${mangaId}/${cap}`;

const pageRes = await fetch(referer, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9"
    },
    redirect: "follow"
});
const html = await pageRes.text();
console.log("Page:", pageRes.status, pageRes.url, html.length);

const assetPath = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
let token = { header: "x-tly-sec", value: "web-z99" };
if (assetPath) {
    const js = await fetch(`${BASE}${assetPath}`, {
        headers: { "User-Agent": "Mozilla/5.0", Referer: referer }
    }).then((r) => r.text());
    const pair = js.match(/"(x-t[a-z0-9-]+)"\s*[,:]\s*"(web-[a-z0-9]+)"/);
    if (pair) token = { header: pair[1], value: pair[2] };
}
console.log("Token:", token);

const apiPath = `/api/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`;
const apiRes = await fetch(`${BASE}${apiPath}`, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json,*/*",
        Referer: referer,
        Origin: BASE,
        [token.header]: token.value
    }
});
const apiText = await apiRes.text();
console.log("API:", apiRes.status, apiText.slice(0, 300));

const pagesMatch = html.match(/"pages"\s*:\s*(\[[\s\S]*?\])/);
if (pagesMatch) console.log("Embedded pages:", pagesMatch[1].slice(0, 200));

const imgs = [...html.matchAll(/https?:\/\/[^"'\s]+\.(?:webp|jpg|jpeg|png)/gi)].map((m) => m[0]);
console.log("Imgs in HTML:", imgs.length, imgs.slice(0, 3));
