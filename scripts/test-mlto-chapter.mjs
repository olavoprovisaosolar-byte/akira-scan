const BASE = "https://mangalivre.to";
const slugs = ["a-garota-do-go", "garota-do-go", "the-girl-of-go", "girl-of-go"];

for (const slug of slugs) {
    const url = `${BASE}/manga/${slug}/capitulo-35/`;
    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/122.0.0.0", Referer: `${BASE}/manga/${slug}/` },
        redirect: "follow"
    });
    const html = await res.text();
    const imgs = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)]
        .map((m) => m[1])
        .filter((u) => /^https?:\/\//.test(u) && /\.(webp|jpg|jpeg|png)/i.test(u));
    console.log(slug, res.status, res.url, "imgs:", imgs.length, imgs[0]?.slice(0, 60));
}
