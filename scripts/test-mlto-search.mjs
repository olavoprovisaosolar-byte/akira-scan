const BASE = "https://mangalivre.to";
const q = encodeURIComponent("A Garota do Go");
const res = await fetch(`${BASE}/?s=${q}`, {
    headers: { "User-Agent": "Mozilla/5.0 Chrome/122.0.0.0", Referer: `${BASE}/` }
});
const html = await res.text();
console.log("Status:", res.status, "Len:", html.length);
const links = [...html.matchAll(/href="https:\/\/mangalivre\.to\/manga\/([^"/?#]+)\/?"/gi)];
console.log("Slugs:", links.slice(0, 8).map((m) => m[1]));
