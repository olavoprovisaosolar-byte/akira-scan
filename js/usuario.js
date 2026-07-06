import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, firebaseAtivo } from "./firebase-config.js";
import catalogoManhwas from "./manhwas.js";

function chaveLocal(userId) {
    return `akirascan_dados_${userId}`;
}

function lerDadosLocais(userId) {
    try {
        const raw = localStorage.getItem(chaveLocal(userId));
        return raw ? JSON.parse(raw) : { favoritos: [], historico_leitura: {} };
    } catch {
        return { favoritos: [], historico_leitura: {} };
    }
}

function guardarDadosLocais(userId, dados) {
    localStorage.setItem(chaveLocal(userId), JSON.stringify(dados));
}

function usarNuvem() {
    return firebaseAtivo() && db !== null;
}

export async function obterDadosUsuario(userId) {
    if (!usarNuvem()) {
        return lerDadosLocais(userId);
    }

    try {
        const userRef = doc(db, "usuarios", userId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        return { favoritos: [], historico_leitura: {} };
    } catch (error) {
        console.warn("Firestore indisponível, a usar dados locais:", error.message);
        return lerDadosLocais(userId);
    }
}

export async function salvarProgresso(userId, manhwaId, numeroCapitulo, extras = {}) {
    const titulo = extras.titulo || catalogoManhwas[manhwaId]?.titulo || "Leitura";
    const entrada = {
        titulo,
        capitulo_atual: Number(numeroCapitulo),
        data: new Date().toLocaleDateString("pt-BR"),
        ...extras
    };

    if (!usarNuvem()) {
        const dados = lerDadosLocais(userId);
        dados.historico_leitura = dados.historico_leitura || {};
        dados.historico_leitura[manhwaId] = entrada;
        guardarDadosLocais(userId, dados);
        return;
    }

    try {
        const userRef = doc(db, "usuarios", userId);
        await setDoc(userRef, {
            historico_leitura: { [manhwaId]: entrada }
        }, { merge: true });
    } catch (error) {
        console.warn("Erro ao guardar progresso na nuvem:", error.message);
        const dados = lerDadosLocais(userId);
        dados.historico_leitura = dados.historico_leitura || {};
        dados.historico_leitura[manhwaId] = entrada;
        guardarDadosLocais(userId, dados);
    }
}

export async function alternarFavorito(userId, manhwaId) {
    if (!usarNuvem()) {
        const dados = lerDadosLocais(userId);
        let favoritos = dados.favoritos || [];
        const jaFavorito = favoritos.includes(manhwaId);
        favoritos = jaFavorito
            ? favoritos.filter((id) => id !== manhwaId)
            : [...favoritos, manhwaId];
        dados.favoritos = favoritos;
        guardarDadosLocais(userId, dados);
        return !jaFavorito;
    }

    try {
        const userRef = doc(db, "usuarios", userId);
        const docSnap = await getDoc(userRef);

        let favoritosAtuais = [];
        if (docSnap.exists() && docSnap.data().favoritos) {
            favoritosAtuais = [...docSnap.data().favoritos];
        }

        const jaFavorito = favoritosAtuais.includes(manhwaId);
        if (jaFavorito) {
            favoritosAtuais = favoritosAtuais.filter((id) => id !== manhwaId);
        } else {
            favoritosAtuais.push(manhwaId);
        }

        await setDoc(userRef, { favoritos: favoritosAtuais }, { merge: true });
        return !jaFavorito;
    } catch (error) {
        console.warn("Erro ao favoritar na nuvem:", error.message);
        const dados = lerDadosLocais(userId);
        let favoritos = dados.favoritos || [];
        const jaFavorito = favoritos.includes(manhwaId);
        favoritos = jaFavorito
            ? favoritos.filter((id) => id !== manhwaId)
            : [...favoritos, manhwaId];
        dados.favoritos = favoritos;
        guardarDadosLocais(userId, dados);
        return !jaFavorito;
    }
}

export async function criarHistoricoDemonstracao(userId) {
    const historico = {
        "leitor-onisciente": {
            titulo: "Ponto de Vista do Leitor Onisciente",
            capitulo_atual: 224,
            capa: "https://placehold.co/200x280/3f3f46/9ca3af?text=ORV",
            data: "28/06/2026"
        },
        "o-comeco-depois-do-fim": {
            titulo: "O Começo Depois do Fim",
            capitulo_atual: 241,
            capa: "https://placehold.co/200x280/3f3f46/9ca3af?text=TBATE",
            data: "26/06/2026"
        }
    };

    if (!usarNuvem()) {
        const dados = lerDadosLocais(userId);
        dados.historico_leitura = historico;
        guardarDadosLocais(userId, dados);
        return true;
    }

    try {
        const userRef = doc(db, "usuarios", userId);
        await setDoc(userRef, { historico_leitura: historico }, { merge: true });
        return true;
    } catch (error) {
        console.warn("Erro ao criar histórico demo na nuvem:", error.message);
        const dados = lerDadosLocais(userId);
        dados.historico_leitura = historico;
        guardarDadosLocais(userId, dados);
        return false;
    }
}
