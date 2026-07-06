import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "data/toonlivre-backup/mangas/obra-69466adb/meta.json"), "utf8"));
const titulo = meta.title;
console.log("title", titulo);

const q = encodeURIComponent(titulo);
const res = await fetch(`https://mangalivre.to/?s=${q}`, {
    headers: { "User-Agent": "Mozilla/5.0 Chrome/122.0.0.0" }
});
const html = await res.text();
console.log("search status", res.status, "len", html.length);

const links = [...html.matchAll(/href="(https:\/\/mangalivre\.to\/manga\/[^"]+)"/gi)].map(m => m[1]);
console.log("links", links.slice(0, 5));

if (links[0]) {
    const slug = links[0].match(/\/manga\/([^/]+)/)[1];
    for (const p of [`/manga/${slug}/capitulo-35/`, `/manga/${slug}/chapter-35/`]) {
        const r = await fetch(`https://mangalivre.to${p}`, { headers: { "User-Agent": "Mozilla/5.0" } });
        const h = await r.text();
        const imgs = [...h.matchAll(/src="([^"]+\.(webp|jpg|jpeg|png)[^"]*)"/gi)].map(m => m[1]);
        console.log(p, r.status, "imgs", imgs.length, imgs[0]?.slice(0, 60));
    }
}
