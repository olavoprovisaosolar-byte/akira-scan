import fs from "fs";
import path from "path";

export const PAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg"]);

export function tituloDoSlug(slug) {
    return slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function numeroDoCapitulo(capId) {
    const s = String(capId);
    const tail = s.match(/-(\d+(?:\.\d+)?)$/);
    if (tail) return Number(tail[1]);
    const capFolder = s.match(/capitulo-(\d+(?:\.\d+)?)$/i);
    if (capFolder) return Number(capFolder[1]);
    const capSimple = s.match(/^cap-(\d+(?:\.\d+)?)$/i);
    if (capSimple) return Number(capSimple[1]);
    return 0;
}

function listarPaginas(capPath) {
    if (!fs.existsSync(capPath)) return [];
    return fs
        .readdirSync(capPath)
        .filter((f) => PAGE_EXT.has(path.extname(f).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function bannerDoManga(mangaPath, mangaId, capaUrl) {
    const fixos = ["banner.jpg", "banner.webp", "banner.png", "banner.jpeg", "banner.svg"];
    for (const f of fixos) {
        if (fs.existsSync(path.join(mangaPath, f))) {
            return `/biblioteca/${encodeURIComponent(mangaId)}/${encodeURIComponent(f)}`;
        }
    }
    return capaUrl || "";
}

function capaDoManga(mangaPath, capitulos) {
    const capaFixa = ["capa.jpg", "capa.png", "capa.webp", "capa.svg", "cover.jpg", "cover.webp"]
        .map((f) => path.join(mangaPath, f))
        .find((p) => fs.existsSync(p));
    if (capaFixa) {
        return path.basename(capaFixa);
    }
    const primeiro = capitulos[0];
    if (primeiro?.pageList?.[0]) {
        return { cap: primeiro.id, file: primeiro.pageList[0] };
    }
    return null;
}

function lerMetaManga(mangaPath, mangaId) {
    const metaPath = path.join(mangaPath, "meta.json");
    const padrao = {
        titulo: tituloDoSlug(mangaId),
        sinopse: "Mangá disponível na biblioteca local.",
        generos: ["Ação", "Fantasia"],
        capa: "",
        banner: ""
    };
    if (!fs.existsSync(metaPath)) return padrao;
    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        return {
            titulo: meta.titulo || padrao.titulo,
            sinopse: meta.sinopse || padrao.sinopse,
            generos: meta.generos || padrao.generos,
            autor: meta.autor || "",
            artista: meta.artista || "",
            status: meta.status || "Em lançamento",
            capa: meta.capa || "",
            banner: meta.banner || meta.capa || ""
        };
    } catch {
        return padrao;
    }
}

export function scanBiblioteca(bibliotecaDir) {
    if (!fs.existsSync(bibliotecaDir)) return [];

    const mangas = [];

    for (const mangaEntry of fs.readdirSync(bibliotecaDir, { withFileTypes: true })) {
        if (!mangaEntry.isDirectory() || mangaEntry.name.startsWith(".")) continue;

        const mangaPath = path.join(bibliotecaDir, mangaEntry.name);
        const capitulos = [];

        for (const capEntry of fs.readdirSync(mangaPath, { withFileTypes: true })) {
            if (!capEntry.isDirectory() || capEntry.name.startsWith(".")) continue;

            const pageList = listarPaginas(path.join(mangaPath, capEntry.name));
            if (!pageList.length) continue;

            capitulos.push({
                id: capEntry.name,
                numero: numeroDoCapitulo(capEntry.name),
                pages: pageList.length,
                pageList
            });
        }

        capitulos.sort((a, b) => a.numero - b.numero || a.id.localeCompare(b.id, undefined, { numeric: true }));
        if (!capitulos.length) continue;

        const meta = lerMetaManga(mangaPath, mangaEntry.name);
        const capaInfo = capaDoManga(mangaPath, capitulos);
        let capaUrl = meta.capa || "";
        if (!capaUrl) {
            if (typeof capaInfo === "string") {
                capaUrl = `/biblioteca/${encodeURIComponent(mangaEntry.name)}/${encodeURIComponent(capaInfo)}`;
            } else if (capaInfo) {
                capaUrl = `/biblioteca/${encodeURIComponent(mangaEntry.name)}/${encodeURIComponent(capaInfo.cap)}/${encodeURIComponent(capaInfo.file)}`;
            }
        }

        mangas.push({
            id: mangaEntry.name,
            titulo: meta.titulo,
            sinopse: meta.sinopse,
            autor: meta.autor,
            artista: meta.artista,
            status: meta.status,
            capa: capaUrl,
            banner: meta.banner || bannerDoManga(mangaPath, mangaEntry.name, capaUrl) || capaUrl,
            generos: meta.generos,
            capitulos: capitulos.map((c) => ({
                id: c.id,
                numero: c.numero > 0 ? c.numero : c.id,
                paginas: c.pages
            })),
            origem: "biblioteca"
        });
    }

    return mangas.sort((a, b) => a.titulo.localeCompare(b.titulo));
}

export function obterCapituloPaginas(bibliotecaDir, mangaId, capituloId) {
    const capPath = path.join(bibliotecaDir, mangaId, capituloId);
    if (!fs.existsSync(capPath) || !fs.statSync(capPath).isDirectory()) {
        return null;
    }

    const files = listarPaginas(capPath);
    return files.map((file, index) => ({
        index,
        url: `/biblioteca/${encodeURIComponent(mangaId)}/${encodeURIComponent(capituloId)}/${encodeURIComponent(file)}`
    }));
}

/** Páginas do backup local ToonLivre (`data/toonlivre-backup/`). */
export function obterCapituloPaginasBackup(root, mangaId, capituloId) {
    const capBase = path.join(root, "data", "toonlivre-backup", "mangas", mangaId, "chapters", capituloId);
    const baseUrl = `/backup/mangas/${encodeURIComponent(mangaId)}/chapters/${encodeURIComponent(capituloId)}/pages`;
    const pagesDir = path.join(capBase, "pages");

    if (fs.existsSync(pagesDir) && fs.statSync(pagesDir).isDirectory()) {
        const files = listarPaginas(pagesDir);
        if (files.length) {
            return files.map((file, index) => ({
                index,
                url: `${baseUrl}/${encodeURIComponent(file)}`
            }));
        }
    }

    const metaPath = path.join(capBase, "meta.json");
    if (!fs.existsSync(metaPath)) return null;

    try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const count = Number(meta.pages);
        if (!count || count < 1) return null;

        const exts = [".webp", ".jpg", ".jpeg", ".png"];
        return Array.from({ length: count }, (_, index) => {
            const stem = String(index + 1).padStart(3, "0");
            const ext = exts.find((e) => fs.existsSync(path.join(pagesDir, stem + e))) || ".webp";
            return { index, url: `${baseUrl}/${stem}${ext}` };
        });
    } catch {
        return null;
    }
}

export function resolverBibliotecaDirs(root) {
    const dirs = [];
    const local = path.resolve(path.join(root, "Biblioteca_Mangas"));
    if (fs.existsSync(local)) dirs.push(local);

    const custom = process.env.BIBLIOTECA_DIR;
    if (custom && fs.existsSync(custom)) {
        const resolved = path.resolve(custom);
        if (!dirs.includes(resolved)) dirs.push(resolved);
    }

    const luk = path.resolve(path.join(root, "..", "servidor 2", "servidor", "Biblioteca_Mangas"));
    if (fs.existsSync(luk) && !dirs.includes(luk)) dirs.push(luk);

    if (!dirs.length) dirs.push(local);
    return dirs;
}

export function scanBibliotecaMulti(dirs) {
    const porId = new Map();
    for (const dir of dirs) {
        for (const m of scanBiblioteca(dir)) {
            if (!porId.has(m.id)) porId.set(m.id, m);
        }
    }
    return [...porId.values()].sort((a, b) => a.titulo.localeCompare(b.titulo));
}

export function resolverBibliotecaDir(root) {
    return resolverBibliotecaDirs(root)[0];
}

/** Índice leve (`data/catalogo-index.json`). */
export function carregarCatalogoIndice(root) {
    const indexPath = path.join(root, "data", "catalogo-index.json");
    if (!fs.existsSync(indexPath)) return null;
    try {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
        return index.mangas || null;
    } catch {
        return null;
    }
}

/** Um mangá por ID — catálogo completo quando disponível. */
export function carregarMangaPorId(root, mangaId) {
    const fromIdx = carregarCatalogoIndice(root)?.find((m) => m.id === mangaId) || null;
    const p = path.join(root, "data", "catalogo.json");
    if (!fs.existsSync(p)) return fromIdx;
    try {
        const data = JSON.parse(fs.readFileSync(p, "utf8"));
        const full = (data.mangas || []).find((m) => m.id === mangaId);
        if (!full) return fromIdx;
        const idxCaps = fromIdx?.capitulos?.length || 0;
        const fullCaps = full.capitulos?.length || 0;
        return fullCaps >= idxCaps ? full : fromIdx;
    } catch {
        return fromIdx;
    }
}

/** Catálogo persistido pelo seed (`data/catalogo.json`). */
export function carregarCatalogoPersistido(root) {
    const p = path.join(root, "data", "catalogo.json");
    if (!fs.existsSync(p)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(p, "utf8"));
        return data.mangas || null;
    } catch {
        return null;
    }
}

/** Biblioteca local + catálogo seed (272+ títulos). */
export function obterMangasCatalogo(root, mergeCatalogoFn) {
    const persistido = carregarCatalogoPersistido(root);
    const serverless = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

    if (serverless) {
        if (persistido?.length) {
            return mergeCatalogoFn([], persistido);
        }
        const indexPath = path.join(root, "data", "catalogo-index.json");
        if (fs.existsSync(indexPath)) {
            try {
                const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
                if (index.mangas?.length) return mergeCatalogoFn([], index.mangas);
            } catch { /* fallback abaixo */ }
        }
        return mergeCatalogoFn([]);
    }

    const dirs = resolverBibliotecaDirs(root);
    const local = scanBibliotecaMulti(dirs);

    if (persistido?.length) {
        return mergeCatalogoFn(local, persistido);
    }
    return mergeCatalogoFn(local);
}
