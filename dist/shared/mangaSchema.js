/**
 * Schema de categorias e fallbacks — fonte única para UI e normalização.
 */
export const MANGA_FALLBACKS = {
    title: "Título não disponível",
    description: "Sinopse não disponível.",
    bannerUrl: "",
    coverUrl: "",
    genre: "Geral",
    status: "Em lançamento",
    author: ""
};
export const MANGA_CATEGORIES = [
    { id: "acao", label: "Ação", icon: "⚔", genres: ["Ação", "Action", "Aventura", "Adventure", "Artes Marciais"], gridLimit: 12 },
    { id: "fantasia", label: "Fantasia", icon: "✨", genres: ["Fantasia", "Fantasy", "Magia", "Monstros", "Demônios", "Wuxia", "Xianxia"], gridLimit: 12 },
    { id: "romance", label: "Romance & Drama", icon: "💕", genres: ["Romance", "Drama", "Slice of Life", "Tragédia"], gridLimit: 10 },
    { id: "reencarnacao", label: "Reencarnação & Isekai", icon: "🌀", genres: ["Reencarnação", "Isekai", "Viagem no Tempo", "Sistema"], gridLimit: 10 },
    { id: "comedia", label: "Comédia & Escolar", icon: "😄", genres: ["Comédia", "Comedy", "Escolar", "School"], gridLimit: 8 },
    { id: "sobrenatural", label: "Sobrenatural", icon: "👻", genres: ["Sobrenatural", "Supernatural", "Mistério", "Mystery", "Suspense"], gridLimit: 8 },
    { id: "terror", label: "Terror & Horror", icon: "👁", genres: ["Terror", "Horror", "Thriller"], gridLimit: 8 },
    { id: "seinen", label: "Seinen & Psicológico", icon: "🗡", genres: ["Seinen", "Psicológico", "Psychological", "Ficção Científica"], gridLimit: 8 },
    { id: "historico", label: "Histórico", icon: "📜", genres: ["Histórico", "Historical", "Guerra"], gridLimit: 6 },
    { id: "harem", label: "Harém & Ecchi", icon: "💋", genres: ["Harém", "Harem", "Ecchi"], gridLimit: 6 },
    { id: "sobrevivencia", label: "Sobrevivência", icon: "🏕", genres: ["Sobrevivência", "Survival", "Apocalipse"], gridLimit: 6 },
    { id: "shounen", label: "Shounen", icon: "🔥", genres: ["Shounen", "Shonen"], gridLimit: 8 }
];
/** Resolve categoria principal de um mangá pelo gênero. */
export function categoryForGenres(generos = []) {
    const lower = generos.map((g) => g.toLowerCase());
    for (const cat of MANGA_CATEGORIES) {
        if (cat.genres.some((g) => lower.some((lg) => lg.includes(g.toLowerCase())))) {
            return cat;
        }
    }
    return null;
}
export function categoryById(id) {
    return MANGA_CATEGORIES.find((c) => c.id === id);
}
