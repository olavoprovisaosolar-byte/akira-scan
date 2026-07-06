import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Manga } from "../../../shared/types/manga.js";
import { assertManga } from "../../../shared/types/manga.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type BibliotecaModule = typeof import("../../../netlify/functions/biblioteca-local.mjs");
type DestaqueModule = typeof import("../../../js/mangas-destaque.js");

let bibliotecaMod: BibliotecaModule | null = null;
let destaqueMod: DestaqueModule | null = null;

async function loadModules() {
    if (!bibliotecaMod) {
        bibliotecaMod = await import(
            pathToFileURL(path.join(ROOT, "netlify/functions/biblioteca-local.mjs")).href
        ) as BibliotecaModule;
    }
    if (!destaqueMod) {
        destaqueMod = await import(pathToFileURL(path.join(ROOT, "js/mangas-destaque.js")).href) as DestaqueModule;
    }
    return { bibliotecaMod: bibliotecaMod!, destaqueMod: destaqueMod! };
}

function carregarCatalogoPersistido(): Manga[] | null {
    const p = path.join(ROOT, "data", "catalogo.json");
    if (!fs.existsSync(p)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(p, "utf8"));
        return (data.mangas as Manga[]) || null;
    } catch {
        return null;
    }
}

export async function obterMangasCatalogo(): Promise<Manga[]> {
    const { bibliotecaMod, destaqueMod } = await loadModules();
    const dirs = bibliotecaMod.resolverBibliotecaDirs(ROOT);
    const local = bibliotecaMod.scanBibliotecaMulti(dirs);
    const persistido = carregarCatalogoPersistido();

    if (persistido?.length) {
        const remoto = persistido.filter((m) => m.origem === "toonlivre");
        if (remoto.length) return destaqueMod.mergeCatalogo(local, remoto as never) as Manga[];
        return destaqueMod.mergeCatalogo(local, persistido as never) as Manga[];
    }
    return destaqueMod.mergeCatalogo(local) as Manga[];
}

export async function obterMangaPorId(mangaId: string): Promise<Manga | null> {
    const mangas = await obterMangasCatalogo();
    const manga = mangas.find((m) => m.id === mangaId) ?? null;
    if (manga) assertManga(manga, mangaId);
    return manga;
}

export function getRoot(): string {
    return ROOT;
}

export async function obterPaginasCapitulo(
    mangaId: string,
    capituloId: string
): Promise<Array<{ index: number; url: string }>> {
    const { bibliotecaMod, destaqueMod } = await loadModules();
    const dirs = bibliotecaMod.resolverBibliotecaDirs(ROOT);

    let baseDir = dirs[0];
    for (const dir of dirs) {
        if (fs.existsSync(path.join(dir, mangaId))) {
            baseDir = dir;
            break;
        }
    }

    const pages = bibliotecaMod.obterCapituloPaginas(baseDir, mangaId, capituloId);
    if (pages?.length) return pages;
    return destaqueMod.paginasDemo(mangaId, capituloId);
}
