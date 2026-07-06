import { obterToken } from "../netlify/functions/toonlivre-client.mjs";

const BASE = "https://toonlivre.net";
const mangaId = "obra-69466adb";
const chapterId = "cap-d501f6c4-35";
const num = "35";
const token = await obterToken(true);

async function tryFetch(label, referer) {
    const api = `${BASE}/api/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(chapterId)}`;
    const res = await fetch(api, {
        headers: {
            "User-Agent": "Mozilla/5.0 Chrome/122.0.0.0",
            Referer: referer,
            Accept: "application/json,*/*",
            [token.header]: token.value
        },
        redirect: "follow"
    });
    const text = await res.text();
    console.log(label, res.status, text.slice(0, 150));
}

await tryFetch("referer home", `${BASE}/`);
await tryFetch("referer manga", `${BASE}/${mangaId}`);
await tryFetch("referer fake cap", `${BASE}/${mangaId}/${num}`);
