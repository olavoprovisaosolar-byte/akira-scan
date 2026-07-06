/**
 * Schema canônico AkiraScan — contrato unificado entre proxy, API e frontend.
 * Formato: { id, title, coverUrl, chapters: [{ id, url, pages: [] }] }
 */
export function toCanonical(manga, source = "unknown") {
    const baseUrl = manga.origem === "toonlivre"
        ? "https://toonlivre.net"
        : manga.origem === "mangalivreto"
            ? "https://mangalivre.to"
            : manga.origem === "mangalivreblog"
                ? "https://mangalivre.blog"
                : manga.origem === "bladetoons"
                    ? "https://bladetoons.com"
                    : "https://mangalivre.net";
    return {
        id: manga.id,
        title: manga.titulo || manga.id,
        coverUrl: manga.capa || "",
        synopsis: manga.sinopse || "",
        source: manga.origem || source,
        status: manga.status,
        genres: manga.generos || [],
        chapters: (manga.capitulos || []).map((c) => {
            const num = c.numero ?? (Number(String(c.id).replace(/\D/g, "")) || 0);
            return {
                id: c.id,
                url: `${baseUrl}/${encodeURIComponent(manga.id)}/${num}`,
                pages: [],
                number: num,
                title: c.titulo ?? null
            };
        })
    };
}
export function fromCanonical(c) {
    return {
        id: c.id,
        titulo: c.title,
        sinopse: c.synopsis || "",
        capa: c.coverUrl,
        banner: c.coverUrl,
        autor: "",
        artista: "",
        generos: c.genres || [],
        status: c.status || "Em lançamento",
        popularidade: 50,
        capitulos: c.chapters.map((ch) => ({
            id: ch.id,
            numero: ch.number ?? (Number(String(ch.id).replace(/\D/g, "")) || 0),
            titulo: ch.title ?? null,
            paginas: ch.pages.length || 0,
            publicadoEm: new Date().toISOString()
        })),
        atualizadoEm: new Date().toISOString(),
        origem: c.source || "api"
    };
}
export function attachChapterPages(manga, chapterId, pages) {
    return {
        ...manga,
        chapters: manga.chapters.map((ch) => ch.id === chapterId ? { ...ch, pages } : ch)
    };
}
export function assertCanonical(data) {
    if (!data || typeof data !== "object")
        throw new Error("Schema inválido.");
    const m = data;
    if (typeof m.id !== "string" || !m.id)
        throw new Error("id ausente.");
    if (typeof m.title !== "string")
        throw new Error("title ausente.");
    if (typeof m.coverUrl !== "string")
        throw new Error("coverUrl ausente.");
    if (!Array.isArray(m.chapters))
        throw new Error("chapters deve ser array.");
}
