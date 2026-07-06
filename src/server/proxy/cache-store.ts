/**
 * Cache Firestore 24h + fallback filesystem local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TTL_MS = Number(process.env.PROXY_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CACHE = path.join(__dirname, "..", "..", "..", "data", "proxy-cache");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreDb = any;

let firestore: FirestoreDb | false | null = null;

async function getFirestore(): Promise<FirestoreDb | false> {
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
        console.warn("[Cache] Firestore indisponível:", (e as Error).message);
        firestore = false;
        return false;
    }
}

function localPath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(LOCAL_CACHE, `${safe}.json`);
}

export interface CacheHit<T> {
    payload: T;
    cached: true;
    source: string;
    from: "firestore" | "local";
}

export async function cacheGet<T>(key: string): Promise<CacheHit<T> | null> {
    const db = await getFirestore();
    if (db) {
        try {
            const snap = await db.collection("proxy_cache").doc(key).get();
            if (!snap.exists) return null;
            const data = snap.data() as { payload: T; source: string; expiresAt: string };
            if (data.expiresAt && Date.now() > new Date(data.expiresAt).getTime()) return null;
            return { payload: data.payload, cached: true, source: data.source, from: "firestore" };
        } catch (e) {
            console.warn("[Cache] Firestore read:", (e as Error).message);
        }
    }

    try {
        const p = localPath(key);
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, "utf8")) as {
            payload: T;
            source: string;
            expiresAt: number;
        };
        if (data.expiresAt && Date.now() > data.expiresAt) {
            fs.unlinkSync(p);
            return null;
        }
        return { payload: data.payload, cached: true, source: data.source, from: "local" };
    } catch {
        return null;
    }
}

export async function cacheSet<T>(key: string, payload: T, source = "unknown"): Promise<void> {
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
            console.warn("[Cache] Firestore write:", (e as Error).message);
        }
    }

    try {
        fs.mkdirSync(LOCAL_CACHE, { recursive: true });
        fs.writeFileSync(localPath(key), JSON.stringify(record, null, 2), "utf8");
    } catch (e) {
        console.warn("[Cache] Local write:", (e as Error).message);
    }
}

export function cacheKey(source: string, type: string, id: string, extra = ""): string {
    return `${source}:${type}:${id}${extra ? `:${extra}` : ""}`;
}

export { TTL_MS };
