import axios from "axios";
import * as cheerio from "cheerio";

const sources = [
    "https://mangalivre.net/manga/solo-leveling/capitulo-200",
    "https://mangalivre.net/manga/solo-leveling/capitulo-200/",
    "https://mangalivre.to/manga/solo-leveling/capitulo-200/"
];

for (const url of sources) {
    try {
        const r = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 20000 });
        const $ = cheerio.load(r.data);
        const reading = [];
        $(".reading-content img, .page-chapter img").each((_, el) => {
            const s = $(el).attr("src") || $(el).attr("data-src") || "";
            if (s) reading.push(s);
        });
        console.log("\n===", url);
        console.log("reading imgs:", reading.length);
        if (reading.length) console.log("first:", reading[0].slice(0, 100));
    } catch (e) {
        console.log("\n===", url, "ERR", e.message);
    }
}
