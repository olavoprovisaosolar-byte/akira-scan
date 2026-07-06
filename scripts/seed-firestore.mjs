/**
 * Seed Firestore — popula mangas/ e capitulos/ a partir de data/catalogo.json.
 * Requer service account (Admin SDK bypassa firestore.rules write:false).
 *
 * Uso:
 *   npm install firebase-admin
 *   set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccountKey.json
 *   node scripts/seed-firestore.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");
const LOG = path.join(ROOT, "logs", "sync.log");
const BATCH_SIZE = 400;

function log(msg) {
    const line = `[${new Date().toISOString()}] [Firestore Seed] ${msg}`;
    console.log(line);
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, line + "\n", "utf8");
}

async function main() {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath || !fs.existsSync(keyPath)) {
        log("Sem GOOGLE_APPLICATION_CREDENTIALS — seed ignorado. Cliente usa API fallback.");
        process.exit(0);
    }

    if (!fs.existsSync(CATALOGO)) {
        log("data/catalogo.json não encontrado. Execute sync-toonlivre.mjs primeiro.");
        process.exit(1);
    }

    let admin;
    try {
        admin = await import("firebase-admin");
    } catch {
        log("Instale firebase-admin: npm install firebase-admin");
        process.exit(1);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    const db = admin.firestore();

    const data = JSON.parse(fs.readFileSync(CATALOGO, "utf8"));
    const mangas = data.mangas || [];
    log(`A importar ${mangas.length} mangás...`);

    let batch = db.batch();
    let ops = 0;

    for (const manga of mangas) {
        const ref = db.collection("mangas").doc(manga.id);
        const { capitulos = [], ...meta } = manga;
        batch.set(ref, {
            id: manga.id,
            titulo: meta.titulo,
            sinopse: meta.sinopse || "",
            autor: meta.autor || "",
            artista: meta.artista || "",
            generos: meta.generos || [],
            status: meta.status || "",
            capa: meta.capa || "",
            banner: meta.banner || meta.capa || "",
            popularidade: meta.popularidade ?? 50,
            atualizadoEm: meta.atualizadoEm || new Date().toISOString(),
            origem: meta.origem || "sync",
            totalCapitulos: capitulos.length
        }, { merge: true });
        ops++;

        for (const cap of capitulos) {
            const capRef = ref.collection("capitulos").doc(String(cap.id));
            batch.set(capRef, {
                id: cap.id,
                numero: cap.numero ?? 0,
                titulo: cap.titulo || null,
                paginas: cap.paginas ?? 0,
                publicadoEm: cap.publicadoEm || null,
                novo: cap.novo || false
            }, { merge: true });
            ops++;

            if (ops >= BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                ops = 0;
            }
        }
    }

    if (ops > 0) await batch.commit();
    log(`Concluído: ${mangas.length} mangás no Firestore.`);
}

main().catch((e) => {
    log(`FATAL: ${e.message}`);
    process.exit(1);
});
