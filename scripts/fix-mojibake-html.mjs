import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const files = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html"));

for (const p of files) {
    const full = path.join(ROOT, p);
    const t = fs.readFileSync(full, "utf8");
    const fixed = Buffer.from(t, "latin1").toString("utf8");
    if (/Ã.|â€/.test(t) && !/Ã.|â€/.test(fixed) && !fixed.includes("\uFFFD")) {
        fs.writeFileSync(full, fixed, "utf8");
        console.log(`${p}: latin1 roundtrip ok`);
        continue;
    }
    const manual = t
        .replace(/\u00E2\u20AC\u201D/g, "—")
        .replace(/\u00E2\u20AC\u00A6/g, "…")
        .replace(/â€”/g, "—")
        .replace(/â€¦/g, "…")
        .replace(/Ã¡/g, "á")
        .replace(/Ã©/g, "é")
        .replace(/Ã­/g, "í")
        .replace(/Ã³/g, "ó")
        .replace(/Ãº/g, "ú")
        .replace(/Ã§/g, "ç")
        .replace(/Ã£/g, "ã")
        .replace(/Ãµ/g, "õ")
        .replace(/Ãª/g, "ê");
    fs.writeFileSync(full, manual, "utf8");
    console.log(`${p}: replacements applied`);
}
