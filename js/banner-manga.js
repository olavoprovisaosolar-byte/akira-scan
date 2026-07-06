/**
 * Banner — utilidades visuais (sem HTML duplicado nos cards).
 */
export function corDoManga(id = "") {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        h = (Math.imul(31, h) + id.charCodeAt(i)) >>> 0;
    }
    return h % 360;
}

export function aplicarTemaBanner(manga, el = document.documentElement) {
    el.style.setProperty("--banner-accent", `hsl(${corDoManga(manga.id)}, 72%, 52%)`);
}
