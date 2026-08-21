/**
 * Estatísticas do leitor — XP, nível, streak, conquistas (derivado do histórico local).
 */

const ACHIEVEMENTS = [
    { id: "first", icon: "📖", nome: "Primeira página", desc: "Começaste a ler", minCaps: 1 },
    { id: "reader10", icon: "🔥", nome: "Leitor ativo", desc: "10 capítulos lidos", minCaps: 10 },
    { id: "reader50", icon: "⚡", nome: "Maratonista", desc: "50 capítulos lidos", minCaps: 50 },
    { id: "reader100", icon: "👑", nome: "Veterano", desc: "100 capítulos lidos", minCaps: 100 },
    { id: "fav5", icon: "💖", nome: "Colecionador", desc: "5 favoritos", minFav: 5 },
    { id: "streak3", icon: "📅", nome: "Consistente", desc: "3 dias seguidos", minStreak: 3 },
    { id: "streak7", icon: "🏆", nome: "Dedicado", desc: "7 dias seguidos", minStreak: 7 }
];

function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function calcStreak(entries) {
    const days = new Set(
        entries
            .map((e) => e.atualizadoEm)
            .filter(Boolean)
            .map(dayKey)
    );
    if (!days.size) return 0;

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const k = dayKey(d.getTime());
        if (days.has(k)) streak++;
        else if (i > 0) break;
    }
    return streak;
}

export function calcularStatsLeitor(historico = {}, favoritos = []) {
    const entries = Object.values(historico || {});
    const capsLidos = entries.reduce((s, h) => s + Math.max(1, Number(h.capitulo_atual) || 1), 0);
    const mangasAndamento = entries.length;
    const mangasConcluidos = entries.filter((h) => h.progresso >= 100).length;
    const minutosEstimados = Math.round(capsLidos * 4.5);
    const horasLeitura = Math.round((minutosEstimados / 60) * 10) / 10;
    const streak = calcStreak(entries);
    const xp = capsLidos * 12 + favoritos.length * 8 + streak * 15;
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 80)));
    const xpProximo = Math.pow(level + 1, 2) * 80;
    const xpAtual = Math.pow(level, 2) * 80;
    const xpProgresso = xpProximo > xpAtual
        ? Math.min(100, Math.round(((xp - xpAtual) / (xpProximo - xpAtual)) * 100))
        : 100;

    const metaDiaria = 3;
    const hoje = dayKey(Date.now());
    const capsHoje = entries.filter((e) => dayKey(e.atualizadoEm) === hoje).length;
    const metaDiariaPct = Math.min(100, Math.round((capsHoje / metaDiaria) * 100));

    const conquistas = ACHIEVEMENTS.filter((a) => {
        if (a.minCaps && capsLidos >= a.minCaps) return true;
        if (a.minFav && favoritos.length >= a.minFav) return true;
        if (a.minStreak && streak >= a.minStreak) return true;
        return false;
    });

    const atividade = entries
        .sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0))
        .slice(0, 8);

    return {
        capsLidos,
        mangasAndamento,
        mangasConcluidos,
        horasLeitura,
        streak,
        xp,
        level,
        xpProgresso,
        xpProximo,
        metaDiaria,
        capsHoje,
        metaDiariaPct,
        conquistas,
        todasConquistas: ACHIEVEMENTS,
        atividade
    };
}

export function tituloNivel(level) {
    if (level >= 20) return "Lendário";
    if (level >= 15) return "Mestre";
    if (level >= 10) return "Expert";
    if (level >= 5) return "Avançado";
    if (level >= 2) return "Leitor";
    return "Novato";
}
