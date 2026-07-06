/**
 * Atualiza capítulos de um mangá ToonLivre no catalogo.json
 * Uso: node scripts/update-manga-chapters.mjs obra-69466adb
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { obterMangaPorSlug, normalizarMangaRemoto } from "../netlify/functions/toonlivre-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const MANGA_ID = process.argv[2] || "obra-69466adb";

async function main() {
    console.log(`Buscando ${MANGA_ID} no ToonLivre…`);
    const raw = await obterMangaPorSlug(MANGA_ID);
    const manga = normalizarMangaRemoto(raw, "/api/catalogo");

    console.log(`Título: ${manga.titulo}`);
    console.log(`Capítulos: ${manga.capitulos.length}`);

    if (!manga.capitulos.length) {
        throw new Error("Nenhum capítulo retornado pela API.");
    }

    const catalogo = JSON.parse(fs.readFileSync(CATALOGO, "utf8"));
    const idx = catalogo.mangas.findIndex((m) => m.id === MANGA_ID);
    if (idx < 0) {
        throw new Error(`Mangá ${MANGA_ID} não encontrado no catálogo.`);
    }

    const prev = catalogo.mangas[idx];
    catalogo.mangas[idx] = {
        ...prev,
        ...manga,
        id: MANGA_ID,
        titulo: manga.titulo || prev.titulo,
        capa: manga.capa || prev.capa,
        banner: manga.banner || prev.banner,
        sinopse: manga.sinopse || prev.sinopse,
        generos: manga.generos?.length ? manga.generos : prev.generos,
        capitulos: manga.capitulos,
        ultimoCapitulo: manga.capitulos[0],
        atualizadoEm: new Date().toISOString(),
        origem: "toonlivre",
        toonlivreId: MANGA_ID
    };

    catalogo.total = catalogo.mangas.length;
    catalogo.atualizadoEm = new Date().toISOString();

    fs.writeFileSync(CATALOGO, JSON.stringify(catalogo, null, 2), "utf8");
    console.log(`✓ Catálogo atualizado — ${manga.capitulos.length} capítulos para "${manga.titulo}"`);
}

main().catch((e) => {
    console.error("Erro:", e.message);
    process.exit(1);
});
