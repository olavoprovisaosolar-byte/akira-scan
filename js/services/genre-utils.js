/** Normaliza género para comparar "acao" com "Ação". */
export function slugGenero(raw = "") {
    return String(raw || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function matchGenero(generos = [], query = "") {
    const q = slugGenero(query);
    if (!q) return true;
    return (generos || []).some((g) => {
        const s = slugGenero(g);
        return s === q || s.includes(q) || q.includes(s);
    });
}

export function slugTipo(raw = "") {
    const s = slugGenero(raw);
    if (/manhwa/.test(s)) return "manhwa";
    if (/manhua/.test(s)) return "manhua";
    if (/novel|webtoon/.test(s)) return s.includes("novel") ? "novel" : "webtoon";
    if (/manga/.test(s)) return "manga";
    return s;
}
