/**
 * Cache com TTL 24h — Firestore (produção) ou filesystem (local).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TTL_MS = Number(process.env.PROXY_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CACHE = path.join(__dirname, "..", "..", "..", "data", "proxy-cache");

let firestore = null;

async function getFirestore() {
    if (firestore !== null) return firestore;
    const json = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!json && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        firestore = false;
        return false;
    }
    try {
        const admin = await import("firebase-admin");
        if (!admin.apps.length) {
            if (json) {
                admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
            } else {
                admin.initializeApp({ credential: admin.credential.applicationDefault() });
            }
        }
        firestore = admin.firestore();
        return firestore;
    } catch (e) {
        console.warn("[Cache] Firestore indisponível:", e.message);
        firestore = false;
        return false;
    }
}

function localPath(key) {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(LOCAL_CACHE, `${safe}.json`);
}

export async function cacheGet(key) {
    const db = await getFirestore();
    if (db) {
        try {
            const snap = await db.collection("proxy_cache").doc(key).get();
            if (!snap.exists) return null;
            const data = snap.data();
            if (data.expiresAt && Date.now() > new Date(data.expiresAt).getTime()) {
                return null;
            }
            return { payload: data.payload, cached: true, source: data.source, from: "firestore" };
        } catch (e) {
            console.warn("[Cache] Firestore read:", e.message);
        }
    }

    try {
        const p = localPath(key);
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, "utf8"));
        if (data.expiresAt && Date.now() > data.expiresAt) {
            fs.unlinkSync(p);
            return null;
        }
        return { payload: data.payload, cached: true, source: data.source, from: "local" };
    } catch {
        return null;
    }
}

export async function cacheSet(key, payload, source = "unknown") {
    const now = Date.now();
    const record = {
        payload,
        source,
        cachedAt: new Date(now).toISOString(),
        expiresAt: now + TTL_MS
    };

    const db = await getFirestore();
    if (db) {
        try {
            await db.collection("proxy_cache").doc(key).set({
                ...record,
                expiresAt: new Date(record.expiresAt).toISOString()
            });
        } catch (e) {
            console.warn("[Cache] Firestore write:", e.message);
        }
    }

    try {
        fs.mkdirSync(LOCAL_CACHE, { recursive: true });
        fs.writeFileSync(localPath(key), JSON.stringify(record, null, 2), "utf8");
    } catch (e) {
        console.warn("[Cache] Local write:", e.message);
    }
}

export function cacheKey(source, type, id, extra = "") {
    return `${source}:${type}:${id}${extra ? `:${extra}` : ""}`;
}

export { TTL_MS };
