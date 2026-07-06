/**
 * Firestore Service — leitura pública conforme firestore.rules.
 * Coleções: mangas/{id}, mangas/{id}/capitulos/{capId}
 */
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, firebaseAtivo } from "../firebase-config.js";

function normalizarCapitulo(data, id) {
    return {
        id: data.id || id,
        numero: data.numero ?? data.number ?? 0,
        titulo: data.titulo || data.title || null,
        paginas: data.paginas ?? data.pageCount ?? 0,
        publicadoEm: data.publicadoEm || data.publishedAt || data.createdAt || null,
        novo: data.novo || data.isNew || false
    };
}

function normalizarManga(data, id, capitulos = []) {
    const caps = [...capitulos].sort((a, b) => Number(b.numero) - Number(a.numero));
    return {
        id: data.id || id,
        titulo: data.titulo || data.title || id,
        sinopse: data.sinopse || data.description || "",
        autor: data.autor || data.author || "",
        artista: data.artista || data.artist || "",
        generos: data.generos || data.genres || [],
        status: data.status || "Em lançamento",
        capa: data.capa || data.coverUrl || "",
        banner: data.banner || data.capa || data.coverUrl || "",
        popularidade: data.popularidade ?? data.popularity ?? data.views ?? 50,
        capitulos: caps,
        atualizadoEm: data.atualizadoEm || caps[0]?.publicadoEm || new Date().toISOString(),
        origem: data.origem || "firestore"
    };
}

export function firestoreDisponivel() {
    return firebaseAtivo() && db !== null;
}

export async function listarMangasFirestore() {
    if (!firestoreDisponivel()) return [];

    try {
        const snap = await getDocs(collection(db, "mangas"));
        if (snap.empty) return [];

        const mangas = [];
        for (const docSnap of snap.docs) {
            try {
                const capsSnap = await getDocs(
                    query(collection(db, "mangas", docSnap.id, "capitulos"), orderBy("numero", "desc"))
                );
                const caps = capsSnap.docs.map((c) => normalizarCapitulo(c.data(), c.id));
                mangas.push(normalizarManga(docSnap.data(), docSnap.id, caps));
            } catch {
                mangas.push(normalizarManga(docSnap.data(), docSnap.id, docSnap.data().capitulos || []));
            }
        }
        return mangas.sort((a, b) => a.titulo.localeCompare(b.titulo));
    } catch (error) {
        console.warn("Firestore listar:", error.message);
        return [];
    }
}

export async function obterMangaFirestore(mangaId) {
    if (!firestoreDisponivel()) return null;

    try {
        const ref = doc(db, "mangas", mangaId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;

        let caps = [];
        try {
            const capsSnap = await getDocs(
                query(collection(db, "mangas", mangaId, "capitulos"), orderBy("numero", "desc"))
            );
            caps = capsSnap.docs.map((c) => normalizarCapitulo(c.data(), c.id));
        } catch {
            caps = snap.data().capitulos || [];
        }

        return normalizarManga(snap.data(), snap.id, caps);
    } catch (error) {
        console.warn("Firestore obterManga:", error.message);
        return null;
    }
}

export async function obterCapsRecentesFirestore(limite = 10) {
    const mangas = await listarMangasFirestore();
    if (!mangas.length) return [];

    const { capsRecentes } = await import("../mangas-destaque.js");
    return capsRecentes(mangas, limite);
}

export async function contarMangasFirestore() {
    if (!firestoreDisponivel()) return 0;
    try {
        const snap = await getDocs(query(collection(db, "mangas"), limit(1)));
        if (snap.empty) return 0;
        const all = await getDocs(collection(db, "mangas"));
        return all.size;
    } catch {
        return 0;
    }
}
