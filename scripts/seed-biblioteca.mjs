/**
 * Atualiza meta.json — capa MAL, sem banners Unsplash duplicados.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MANGAS_DESTAQUE } from "../js/mangas-destaque.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIBLIOTECA = path.join(__dirname, "..", "Biblioteca_Mangas");

function escreverMeta(pasta, dados) {
    try {
        if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
    } catch {
        console.log(`  skip ${dados.titulo} (pasta inacessível)`);
        return;
    }
    const { capa, titulo, sinopse, generos, autor, artista, status } = dados;
    fs.writeFileSync(path.join(pasta, "meta.json"), JSON.stringify({
        titulo, sinopse, generos, autor, artista, status,
        capa,
        banner: capa
    }, null, 2), "utf8");
}

console.log("AkiraScan — corrigir metadados da biblioteca\n");

if (!fs.existsSync(BIBLIOTECA)) fs.mkdirSync(BIBLIOTECA, { recursive: true });

for (const m of MANGAS_DESTAQUE) {
    const pasta = path.join(BIBLIOTECA, m.id);
    escreverMeta(pasta, m);
    console.log(`  ✓ ${m.titulo}`);
}

console.log("\nMetadados corrigidos (banner = capa).");
