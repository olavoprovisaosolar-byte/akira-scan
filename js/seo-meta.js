/**
 * Meta tags dinâmicas — SEO e compartilhamento social.
 */
function upsertMeta(attr, key, content) {
    if (!content) return;
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
    }
    el.setAttribute("content", content);
}

export function setMangaMeta(manga) {
    if (!manga?.titulo) return;
    const title = `${manga.titulo} — AkiraScan`;
    const desc = (manga.sinopse || `Leia ${manga.titulo} online no AkiraScan.`).slice(0, 160);
    document.title = title;
    upsertMeta("name", "description", desc);
    upsertMeta("property", "og:title", manga.titulo);
    upsertMeta("property", "og:description", desc);
    upsertMeta("property", "og:type", "book");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", manga.titulo);
    upsertMeta("name", "twitter:description", desc);
    const cover = manga.capa || manga.banner;
    if (cover && !cover.startsWith("data/")) {
        const url = cover.startsWith("http") ? cover : `${location.origin}/${cover.replace(/^\//, "")}`;
        upsertMeta("property", "og:image", url);
        upsertMeta("name", "twitter:image", url);
    }
}

export function resetHomeMeta() {
    document.title = "AkiraScan — Leia Mangás Online";
    upsertMeta("name", "description", "AkiraScan — leia mangás online com interface premium, favoritos, histórico e catálogo.");
}
