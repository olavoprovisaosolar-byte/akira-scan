/**
 * Metadados base — capas MAL únicas por título. Banner = capa (sem imagens genéricas duplicadas).
 */
import { parseChapterNumber } from "./services/chapter-label.js";

export const MANGAS_DESTAQUE = [
    { id: "solo-leveling", titulo: "Solo Leveling", sinopse: "Sung Jinwoo, o caçador mais fraco, ganha um sistema que lhe permite subir de nível sem limites.", autor: "Chugong", artista: "DUBU", generos: ["Ação", "Fantasia", "Sistema"], status: "Completo", popularidade: 100, capa: "https://cdn.myanimelist.net/images/manga/3/183705.jpg" },
    { id: "chainsaw-man", titulo: "Chainsaw Man", sinopse: "Denji funde-se com o demônio Pochita e torna-se o Homem-Motosserra.", autor: "Fujimoto Tatsuki", artista: "Fujimoto Tatsuki", generos: ["Ação", "Horror"], status: "Em lançamento", popularidade: 95, capa: "https://cdn.myanimelist.net/images/manga/3/216464.jpg" },
    { id: "jujutsu-kaisen", titulo: "Jujutsu Kaisen", sinopse: "Yuji Itadori entra no mundo das maldições.", autor: "Gege Akutami", artista: "Gege Akutami", generos: ["Ação", "Sobrenatural"], status: "Em lançamento", popularidade: 94, capa: "https://cdn.myanimelist.net/images/manga/3/210465.jpg" },
    { id: "one-punch-man", titulo: "One Punch Man", sinopse: "Saitama derrota qualquer inimigo com um soco.", autor: "ONE", artista: "Yusuke Murata", generos: ["Ação", "Comédia"], status: "Em lançamento", popularidade: 92, capa: "https://cdn.myanimelist.net/images/manga/3/80661.jpg" },
    { id: "demon-slayer", titulo: "Demon Slayer", sinopse: "Tanjiro percorre o Japão para curar a irmã.", autor: "Koyoharu Gotouge", artista: "Koyoharu Gotouge", generos: ["Ação", "Fantasia"], status: "Completo", popularidade: 91, capa: "https://cdn.myanimelist.net/images/manga/3/179023.jpg" },
    { id: "tower-of-god", titulo: "Tower of God", sinopse: "Bam sobe a Torre misteriosa.", autor: "SIU", artista: "SIU", generos: ["Ação", "Fantasia"], status: "Em lançamento", popularidade: 88, capa: "https://cdn.myanimelist.net/images/manga/2/189339.jpg" },
    { id: "omniscient-reader", titulo: "Omniscient Reader", sinopse: "O único leitor de um webnovel vê o apocalipse tornar-se realidade.", autor: "sing N song", artista: "Sleepy-C", generos: ["Ação", "Fantasia"], status: "Em lançamento", popularidade: 90, capa: "https://cdn.myanimelist.net/images/manga/3/249307.jpg" },
    { id: "obra-0f20295f", titulo: "O Começo Depois do Fim", sinopse: "Um rei reencarna num mundo mágico com uma segunda chance.", autor: "TurtleMe", artista: "Eginhardt", generos: ["Fantasia", "Ação", "Reencarnação"], status: "Em lançamento", popularidade: 96, capa: "https://cdn.myanimelist.net/images/manga/3/227675.jpg" },
    { id: "naruto", titulo: "Naruto", sinopse: "Naruto sonha em tornar-se Hokage.", autor: "Masashi Kishimoto", artista: "Masashi Kishimoto", generos: ["Ação", "Aventura"], status: "Completo", popularidade: 87, capa: "https://cdn.myanimelist.net/images/manga/2/253146.jpg" },
    { id: "one-piece", titulo: "One Piece", sinopse: "Luffy procura o tesouro One Piece.", autor: "Eiichiro Oda", artista: "Eiichiro Oda", generos: ["Ação", "Aventura"], status: "Em lançamento", popularidade: 99, capa: "https://cdn.myanimelist.net/images/manga/3/55551.jpg" },
    { id: "attack-on-titan", titulo: "Attack on Titan", sinopse: "Humanidade contra titãs devoradores.", autor: "Hajime Isayama", artista: "Hajime Isayama", generos: ["Ação", "Drama"], status: "Completo", popularidade: 86, capa: "https://cdn.myanimelist.net/images/manga/2/37846.jpg" },
    { id: "blue-lock", titulo: "Blue Lock", sinopse: "Programa brutal para criar o melhor goleador.", autor: "Muneyuki Kaneshiro", artista: "Yusuke Nomura", generos: ["Desporto", "Drama"], status: "Em lançamento", popularidade: 85, capa: "https://cdn.myanimelist.net/images/manga/2/253434.jpg" },
    { id: "spy-x-family", titulo: "Spy x Family", sinopse: "Um espião forma uma família falsa.", autor: "Tatsuya Endo", artista: "Tatsuya Endo", generos: ["Ação", "Comédia"], status: "Em lançamento", popularidade: 84, capa: "https://cdn.myanimelist.net/images/manga/3/238888.jpg" },
    { id: "vinland-saga", titulo: "Vinland Saga", sinopse: "Thorfinn na era dos vikingues.", autor: "Makoto Yukimura", artista: "Makoto Yukimura", generos: ["Ação", "Histórico"], status: "Em lançamento", popularidade: 83, capa: "https://cdn.myanimelist.net/images/manga/2/188925.jpg" },
    { id: "bleach", titulo: "Bleach", sinopse: "Ichigo torna-se Shinigami.", autor: "Tite Kubo", artista: "Tite Kubo", generos: ["Ação", "Sobrenatural"], status: "Completo", popularidade: 82, capa: "https://cdn.myanimelist.net/images/manga/1/157931.jpg" },
    { id: "hunter-x-hunter", titulo: "Hunter x Hunter", sinopse: "Gon torna-se Hunter.", autor: "Yoshihiro Togashi", artista: "Yoshihiro Togashi", generos: ["Ação", "Aventura"], status: "Em hiato", popularidade: 81, capa: "https://cdn.myanimelist.net/images/manga/1/157897.jpg" },
    { id: "black-clover", titulo: "Black Clover", sinopse: "Asta sonha em tornar-se Rei Mago.", autor: "Yuki Tabata", artista: "Yuki Tabata", generos: ["Ação", "Fantasia"], status: "Em lançamento", popularidade: 80, capa: "https://cdn.myanimelist.net/images/manga/2/166952.jpg" },
    { id: "mob-psycho-100", titulo: "Mob Psycho 100", sinopse: "Shigeo esconde poderes psíquicos enormes.", autor: "ONE", artista: "ONE", generos: ["Ação", "Comédia"], status: "Completo", popularidade: 79, capa: "https://cdn.myanimelist.net/images/manga/3/138375.jpg" }
];

const CAPS_PADRAO = 3;

function isLocalPath(url) {
    return typeof url === "string" && (url.startsWith("/biblioteca/") || url.startsWith("/backup/") || url.startsWith("/data/toonlivre-backup/"));
}

function isRemoteUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** Banner = capa (evita imagens erradas/duplicadas de stock photos) */
function normalizarImagens(m) {
    const capa = m.capa || "";
    let banner = m.banner || capa;
    if (isLocalPath(m.banner)) banner = m.banner;
    else if (isRemoteUrl(capa)) banner = capa;
    else if (isLocalPath(capa)) banner = capa;
    return { capa, banner };
}

export function enriquecerDestaque(manga) {
    const { capa, banner } = normalizarImagens(manga);
    const caps = manga.capitulos?.length
        ? manga.capitulos.map((c, i) => ({
            ...c,
            numero: parseChapterNumber(c) || (i + 1),
            publicadoEm: c.publicadoEm || manga.atualizadoEm || new Date().toISOString()
        }))
        : Array.from({ length: CAPS_PADRAO }, (_, i) => ({
            id: `capitulo-${String(i + 1).padStart(2, "0")}`,
            numero: i + 1,
            paginas: 0,
            publicadoEm: new Date(Date.now() - i * 86400000).toISOString()
        }));

    const ultimoCap = caps[caps.length - 1];

    return {
        ...manga,
        capa,
        banner,
        capitulos: caps,
        ultimoCapitulo: ultimoCap,
        atualizadoEm: manga.atualizadoEm || ultimoCap?.publicadoEm || new Date().toISOString(),
        origem: manga.origem || "destaque"
    };
}

export function paginasDemo(mangaId, capituloId) {
    const tail = String(capituloId).match(/-(\d+(?:\.\d+)?)$/);
    const cap = tail ? Number(tail[1]) : 1;
    return Array.from({ length: 6 }, (_, i) => ({
        index: i,
        url: `https://placehold.co/800x1200/141419/c44dff?text=${encodeURIComponent(mangaId)}+Cap${cap}+P${i + 1}`
    }));
}

function isApiProxyPath(url) {
    return typeof url === "string" && url.startsWith("/api/");
}

/** Capa do próprio mangá — nunca empresta de outro título. */
function escolherCapa(entry, existing = {}) {
    const candidates = [entry.capa, entry.banner, existing.capa, existing.banner].filter(Boolean);
    for (const c of candidates) {
        if (isLocalPath(c) || isRemoteUrl(c) || isApiProxyPath(c)) return c;
    }
    return entry.capa || existing.capa || "";
}

export function mergeCatalogo(local = [], remoto = null) {
    const map = new Map();
    const seed = remoto?.length
        ? remoto
        : local.length
            ? local
            : MANGAS_DESTAQUE;

    for (const m of seed.map(enriquecerDestaque)) {
        map.set(m.id, { ...m });
    }

    for (const m of local) {
        const base = map.get(m.id) || {};
        const capaEscolhida = escolherCapa(m, base);
        const bannerEscolhido = isLocalPath(m.banner) ? m.banner : (capaEscolhida || base.banner);
        const tituloLocalFraco = !m.titulo
            || /^obra[\s-]/i.test(m.titulo)
            || m.titulo === m.id;
        const sinopseLocalFraca = !m.sinopse || m.sinopse.includes("biblioteca local");
        // Unir caps do catálogo + pasta local (evita perder lista completa do backup).
        const byId = new Map();
        for (const c of (base.capitulos || [])) byId.set(c.id, { ...c });
        for (const c of (m.capitulos || [])) {
            const prev = byId.get(c.id);
            byId.set(c.id, prev ? { ...prev, ...c, id: c.id } : { ...c });
        }
        const capitulos = byId.size
            ? [...byId.values()].sort((a, b) => parseChapterNumber(b) - parseChapterNumber(a))
            : (base.capitulos || m.capitulos);
        const merged = enriquecerDestaque({
            ...base,
            ...m,
            titulo: tituloLocalFraco ? (base.titulo || m.titulo) : (m.titulo || base.titulo),
            sinopse: sinopseLocalFraca ? (base.sinopse || m.sinopse) : m.sinopse,
            autor: m.autor || base.autor,
            artista: m.artista || base.artista,
            generos: m.generos?.length ? m.generos : base.generos,
            status: m.status || base.status,
            popularidade: m.popularidade ?? base.popularidade ?? 50,
            capa: capaEscolhida,
            banner: bannerEscolhido,
            capitulos
        });
        const img = normalizarImagens({
            capa: capaEscolhida,
            banner: merged.banner || capaEscolhida
        });
        const origem = base.origem && base.origem !== "biblioteca"
            ? base.origem
            : (m.origem || base.origem);
        map.set(m.id, { ...merged, ...img, origem });
    }
    return [...map.values()].sort((a, b) => a.titulo.localeCompare(b.titulo));
}

export function rankingSemanal(mangas, limite = 10) {
    return ordenar(mangas, "popular").slice(0, limite).map((m, i) => ({ ...m, rank: i + 1 }));
}

export function todosGeneros(mangas) {
    const set = new Set();
    mangas.forEach((m) => (m.generos || []).forEach((g) => set.add(g)));
    return [...set].sort();
}

export function capsRecentes(mangas, limite = 12) {
    const itens = [];
    for (const m of mangas) {
        const caps = [...(m.capitulos || [])].sort((a, b) => {
            const da = new Date(a.publicadoEm || 0);
            const db = new Date(b.publicadoEm || 0);
            return db - da;
        });
        const ult = caps[0];
        if (ult) {
            itens.push({
                mangaId: m.id,
                titulo: m.titulo,
                capa: m.capa,
                capitulo: ult,
                publicadoEm: ult.publicadoEm || m.atualizadoEm
            });
        }
    }
    return itens
        .sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm))
        .slice(0, limite);
}

export function ordenar(mangas, sort = "az") {
    const lista = [...mangas];
    if (sort === "popular") return lista.sort((a, b) => (b.popularidade || 0) - (a.popularidade || 0));
    if (sort === "recentes") return lista.sort((a, b) => new Date(b.atualizadoEm || 0) - new Date(a.atualizadoEm || 0));
    return lista.sort((a, b) => a.titulo.localeCompare(b.titulo));
}
