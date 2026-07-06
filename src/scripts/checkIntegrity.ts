/**
 * checkIntegrity — valida biblioteca: banner, capítulos, título.
 * Uso: npx tsx src/scripts/checkIntegrity.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeManga, isCompleteManga } from "../client/services/DataNormalizer.js";
import { logger } from "../core/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const CATALOGO = path.join(ROOT, "data", "catalogo.json");

interface IntegrityReport {
    total: number;
    complete: number;
    incomplete: string[];
}

function loadCatalog(): unknown[] {
    if (!fs.existsSync(CATALOGO)) {
        console.error("[Integrity] catalogo.json não encontrado.");
        return [];
    }
    const data = JSON.parse(fs.readFileSync(CATALOGO, "utf8")) as { mangas?: unknown[] };
    return data.mangas || [];
}

export function checkLibraryIntegrity(mangas: unknown[]): IntegrityReport {
    const incomplete: string[] = [];
    let complete = 0;

    for (const raw of mangas) {
        try {
            const id = (raw as Record<string, unknown>).id as string;
            const n = normalizeManga(raw, id);
            if (isCompleteManga(n)) {
                complete += 1;
            } else {
                incomplete.push(id);
                const missing: string[] = [];
                if (!n.bannerUrl && !n.coverUrl) missing.push("banner/capa");
                if (!n.chapters.length) missing.push("capítulos");
                if (n.title === "Título não disponível") missing.push("título");
                logger.warn("Integrity", `Incompleto: ${id}`, { missing });
            }
        } catch (e) {
            const id = String((raw as Record<string, unknown>)?.id || "?");
            incomplete.push(id);
            logger.error("Integrity", `Corrompido: ${id}`, { err: (e as Error).message });
        }
    }

    return { total: mangas.length, complete, incomplete };
}

/** Lista apenas mangás completos (para Populares/Destaques). */
export function filterComplete(mangas: unknown[]): unknown[] {
    return mangas.filter((raw) => {
        try {
            const id = (raw as Record<string, unknown>).id as string;
            return isCompleteManga(normalizeManga(raw, id));
        } catch {
            return false;
        }
    });
}

if (process.argv[1]?.includes("checkIntegrity")) {
    const mangas = loadCatalog();
    const report = checkLibraryIntegrity(mangas);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.incomplete.length ? 1 : 0);
}
