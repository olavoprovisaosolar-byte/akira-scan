/**
 * seedDatabase — ingestão com failover A→B→C e checagem de sanidade.
 * Uso: npm run seed:db
 *
 * Logs de rastreamento:
 *   grep "MangaLivreToAdapter" ou "Failover → Provedor C" no console
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../core/logger.js";
import { fetchMangaWithFailover, scrapers } from "../services/scrapers/ScraperRegistry.js";
import { normalizeIngestManga, ingestToLegacy } from "../services/ingestion/normalize.js";
import { runSanityCheck } from "../services/ingestion/sanity-check.js";
import { MANGAS_DESTAQUE } from "../../js/mangas-destaque.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data");
const CATALOGO = path.join(DATA, "catalogo.json");
const PENDING = path.join(DATA, "pending_review.json");
const INGESTION_STATUS = path.join(DATA, "ingestion-status.json");
const CRITICAL_LOG = path.join(DATA, "critical_error_log.json");

const SEED_LIMIT = Number(process.env.SEED_LIMIT || 30);
const DISCOVER_MLT = process.env.SEED_DISCOVER_MLT !== "0";

export interface SeedReport {
    startedAt: string;
    finishedAt: string;
    attempted: number;
    published: number;
    pendingReview: number;
    failed: number;
    sources: Record<string, number>;
    failures: Array<{ id: string; error: string; attempts: unknown[] }>;
}

function writeJson(file: string, data: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

async function discoverSeedIds(): Promise<string[]> {
    const ids = new Set<string>();

    for (const m of MANGAS_DESTAQUE) {
        if (m.id) ids.add(m.id);
    }

    if (DISCOVER_MLT) {
        try {
            logger.info("seedDatabase", "Descoberta de slugs em mangalivre.to…");
            const slugs = await scrapers.mangalivreto.listCatalogSlugs(3);
            for (const slug of slugs.slice(0, SEED_LIMIT)) {
                ids.add(slug);
            }
            logger.info("seedDatabase", `${slugs.length} slugs descobertos em mangalivre.to`);
        } catch (e) {
            logger.warn("seedDatabase", "Descoberta mangalivre.to falhou", { err: (e as Error).message });
        }
    }

    return [...ids].slice(0, SEED_LIMIT);
}

async function ingestOne(mangaId: string): Promise<{
    ok: boolean;
    legacy?: ReturnType<typeof ingestToLegacy>;
    status: "published" | "pending_review" | "failed";
    source?: string;
    error?: string;
    attempts?: unknown[];
    sanity?: unknown;
}> {
    logger.info("seedDatabase", `Ingestão: ${mangaId}`);

    try {
        const { manga, source, attempts } = await fetchMangaWithFailover(mangaId, "auto");
        const normalized = normalizeIngestManga(manga, mangaId, source);
        const sanity = await runSanityCheck(normalized);
        const legacy = ingestToLegacy(normalized);

        if (sanity.status === "published") {
            logger.info("seedDatabase", `✓ Publicado: ${mangaId} via ${source}`, { caps: legacy.capitulos?.length });
            return { ok: true, legacy, status: "published", source, attempts, sanity };
        }

        logger.warn("seedDatabase", `⏸ pending_review: ${mangaId}`, {
            source,
            errors: sanity.errors,
            warnings: sanity.warnings
        });
        return {
            ok: true,
            legacy: { ...legacy, reviewStatus: "pending_review", sanityNotes: [...sanity.errors, ...sanity.warnings] },
            status: "pending_review",
            source,
            attempts,
            sanity
        };
    } catch (e) {
        const err = (e as Error).message;
        logger.error("seedDatabase", `✗ Falha total: ${mangaId}`, { err });
        return { ok: false, status: "failed", error: err };
    }
}

export async function seedDatabase(): Promise<SeedReport> {
    const startedAt = new Date().toISOString();
    const seedIds = await discoverSeedIds();

    logger.info("seedDatabase", `=== Início — ${seedIds.length} mangás na fila ===`);

    const published: ReturnType<typeof ingestToLegacy>[] = [];
    const pending: ReturnType<typeof ingestToLegacy>[] = [];
    const failures: SeedReport["failures"] = [];
    const sources: Record<string, number> = {};

    for (const id of seedIds) {
        const result = await ingestOne(id);

        if (result.source) {
            sources[result.source] = (sources[result.source] || 0) + 1;
        }

        if (result.status === "published" && result.legacy) {
            published.push(result.legacy);
        } else if (result.status === "pending_review" && result.legacy) {
            pending.push(result.legacy);
        } else if (result.status === "failed") {
            failures.push({ id, error: result.error || "unknown", attempts: result.attempts || [] });
        }

        await new Promise((r) => setTimeout(r, 400));
    }

    const finishedAt = new Date().toISOString();
    const report: SeedReport = {
        startedAt,
        finishedAt,
        attempted: seedIds.length,
        published: published.length,
        pendingReview: pending.length,
        failed: failures.length,
        sources,
        failures
    };

    if (published.length) {
        let existing: ReturnType<typeof ingestToLegacy>[] = [];
        try {
            if (fs.existsSync(CATALOGO)) {
                const prev = JSON.parse(fs.readFileSync(CATALOGO, "utf8")) as { mangas?: ReturnType<typeof ingestToLegacy>[] };
                existing = prev.mangas || [];
            }
        } catch { /* ignore */ }

        const byId = new Map<string, ReturnType<typeof ingestToLegacy>>();
        for (const m of existing) byId.set(m.id, m);
        for (const m of published) byId.set(m.id, m);

        const merged = [...byId.values()];
        writeJson(CATALOGO, {
            fonte: "failover-ingest",
            atualizadoEm: finishedAt,
            total: merged.length,
            providers: sources,
            mangas: merged
        });
        logger.info("seedDatabase", `Catálogo salvo: ${merged.length} mangás (${published.length} novos/atualizados)`);
    }

    if (pending.length) {
        writeJson(PENDING, {
            atualizadoEm: finishedAt,
            total: pending.length,
            mangas: pending
        });
        logger.info("seedDatabase", `Pending review: ${pending.length} mangás`);
    }

    const ingestionOk = published.length > 0;
    writeJson(INGESTION_STATUS, {
        ok: ingestionOk,
        message: ingestionOk
            ? `Biblioteca atualizada com ${published.length} mangás.`
            : "Não foi possível popular a biblioteca. Todas as fontes falharam ou os dados não passaram na verificação.",
        userMessage: ingestionOk
            ? null
            : "Estamos com dificuldades para atualizar o catálogo. Nossa equipe já foi notificada — tente novamente em alguns minutos.",
        report,
        ts: finishedAt
    });

    if (!ingestionOk) {
        writeJson(CRITICAL_LOG, {
            level: "CRITICAL",
            ts: finishedAt,
            message: "Ingestão falhou — nenhum mangá publicado após failover A→B→C",
            report,
            recentLogs: logger.getRecent(30)
        });
        logger.error("seedDatabase", "CRITICAL — critical_error_log.json gerado");
    }

    logger.info("seedDatabase", "=== Concluído ===", report as unknown as Record<string, unknown>);
    return report;
}

if (process.argv[1]?.includes("seedDatabase")) {
    seedDatabase()
        .then((r) => {
            console.log(JSON.stringify(r, null, 2));
            process.exit(r.published > 0 ? 0 : 1);
        })
        .catch((e) => {
            logger.error("seedDatabase", "FATAL", { err: (e as Error).message });
            writeJson(CRITICAL_LOG, {
                level: "CRITICAL",
                ts: new Date().toISOString(),
                message: (e as Error).message,
                recentLogs: logger.getRecent(20)
            });
            process.exit(1);
        });
}
