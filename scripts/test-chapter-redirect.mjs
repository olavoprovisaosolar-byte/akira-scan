const BASE = "https://toonlivre.net";
const mangaId = "obra-69466adb";
const cap = "35";
const referer = `${BASE}/${mangaId}/${cap}`;

const res = await fetch(referer, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9"
    },
    redirect: "manual"
});
console.log("Status:", res.status);
console.log("Location:", res.headers.get("location"));
if (res.status < 400) {
    const html = await res.text();
    console.log("Len:", html.length, "cdn:", /cdn\.toonlivre/.test(html));
}
