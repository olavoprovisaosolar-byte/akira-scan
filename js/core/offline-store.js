/**
 * Persistência offline — IndexedDB + checksum de integridade.
 */
const DB_NAME = "akirascan_offline";
const DB_VERSION = 1;
const STORE_MANGAS = "mangas";
const STORE_CAPITULOS = "capitulos";

let dbPromise = null;

function openDb() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            resolve(null);
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_MANGAS)) {
                db.createObjectStore(STORE_MANGAS, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_CAPITULOS)) {
                db.createObjectStore(STORE_CAPITULOS, { keyPath: "key" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    return dbPromise;
}

function idbPut(storeName, value) {
    return openDb().then((db) => {
        if (!db) return false;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).put(value);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    });
}

function idbGet(storeName, key) {
    return openDb().then((db) => {
        if (!db) return null;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    });
}

/** Hash simples para verificar integridade de capítulos offline. */
async function checksumPages(paginas) {
    const raw = JSON.stringify(paginas);
    if (!crypto?.subtle) {
        let h = 0;
        for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
        return String(h);
    }
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export const OfflineStore = {
    async saveManga(manga) {
        if (!manga?.id) return false;
        const record = { ...manga, _cachedAt: Date.now() };
        try {
            await idbPut(STORE_MANGAS, record);
        } catch {
            localStorage.setItem(`offline_manga_${manga.id}`, JSON.stringify(record));
        }
        return true;
    },

    async getManga(mangaId) {
        try {
            const fromIdb = await idbGet(STORE_MANGAS, mangaId);
            if (fromIdb) return fromIdb;
        } catch { /* fallback */ }

        try {
            const raw = localStorage.getItem(`offline_manga_${mangaId}`);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    async saveCapitulo(mangaId, capituloId, paginas) {
        const key = `${mangaId}:${capituloId}`;
        const hash = await checksumPages(paginas);
        const record = { key, mangaId, capituloId, paginas, _checksum: hash, _cachedAt: Date.now() };
        try {
            await idbPut(STORE_CAPITULOS, record);
        } catch {
            localStorage.setItem(`offline_cap_${key}`, JSON.stringify(record));
        }
        return true;
    },

    async getCapitulo(mangaId, capituloId) {
        const key = `${mangaId}:${capituloId}`;
        try {
            const fromIdb = await idbGet(STORE_CAPITULOS, key);
            if (fromIdb?.paginas) {
                const hash = await checksumPages(fromIdb.paginas);
                if (fromIdb._checksum && fromIdb._checksum !== hash) {
                    console.warn("[OfflineStore] Checksum inválido — capítulo corrompido.", key);
                    return null;
                }
                return fromIdb.paginas;
            }
        } catch { /* fallback */ }

        try {
            const raw = localStorage.getItem(`offline_cap_${key}`);
            return raw ? JSON.parse(raw).paginas : null;
        } catch {
            return null;
        }
    }
};
