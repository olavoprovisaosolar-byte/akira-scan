const BASE = "https://toonlivre.net";
const mangaId = "obra-69466adb";
const chapterId = "cap-d501f6c4-35";
const referer = `${BASE}/${mangaId}/35`;
const token = { header: "x-tly-sec", value: "web-z99" };
const apiPath = `/api/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`;

const apiRes = await fetch(`${BASE}${apiPath}`, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json,*/*",
        Referer: referer,
        Origin: BASE,
        [token.header]: token.value
    },
    redirect: "manual"
});
console.log("Status:", apiRes.status);
console.log("Location:", apiRes.headers.get("location"));
const text = await apiRes.text();
console.log("Body:", text.slice(0, 400));
