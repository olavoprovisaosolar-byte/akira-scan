const mangaId = "obra-69466adb";
const capId = "cap-d501f6c4-35";
const patterns = [
    `https://cdn.toonlivre.net/chapters/${mangaId}/${capId}/001.webp`,
    `https://cdn.toonlivre.net/chapters/${mangaId}/${capId}/page-001.webp`,
    `https://cdn.toonlivre.net/${mangaId}/${capId}/001.webp`,
    `https://cdn.toonlivre.net/manga/${mangaId}/${capId}/001.webp`,
    `https://cdn.toonlivre.net/pages/${mangaId}/${capId}/001.webp`,
    `https://cdn.toonlivre.net/covers/${mangaId}/${capId}/001.webp`
];

for (const url of patterns) {
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0", Referer: "https://toonlivre.net/" },
            redirect: "follow"
        });
        console.log(res.status, url.slice(0, 80), res.headers.get("content-type"));
    } catch (e) {
        console.log("ERR", url.slice(0, 60), e.cause?.code || e.message);
    }
}
