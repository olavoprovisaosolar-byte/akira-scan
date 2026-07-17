/**
 * Interface do módulo capture — apenas leitura NexusToons, saída JSON.
 *
 * @typedef {import('../shared/schema.js').CapturedChapter} CapturedChapter
 * @typedef {import('../shared/schema.js').CapturedMangaMeta} CapturedMangaMeta
 */

/**
 * @typedef {Object} CaptureAdapter
 * @property {string} name
 * @property {(opts?: { page?: number, limit?: number }) => Promise<CapturedMangaMeta[]>} listMangas
 * @property {(slug: string) => Promise<CapturedMangaMeta>} getManga
 * @property {(slug: string) => Promise<Array<{ id: number|string, number: string|number, title?: string|null }>>} listChapters
 * @property {(slug: string, chapterRef: { id: number|string, number: string|number, title?: string|null }, akiraIds: { mangaId: string, capId: string }) => Promise<CapturedChapter>} captureChapter
 * @property {() => Promise<void>} [close]
 */

/** @type {CaptureAdapter|null} */
let adapter = null;

export async function getCaptureAdapter(name = process.env.NEXUSTOONS_CAPTURE_ADAPTER || "nexustoons") {
    if (adapter && adapter.name === name) return adapter;
    if (name === "playwright") {
        const mod = await import("./nexustoons-playwright.mjs");
        adapter = mod.createAdapter();
    } else if (name === "toonlivre") {
        const mod = await import("./toonlivre.mjs");
        adapter = mod.createAdapter();
    } else {
        const mod = await import("./nexustoons.js");
        adapter = mod.createAdapter();
    }
    return adapter;
}

export async function closeCaptureAdapter() {
    if (adapter?.close) await adapter.close();
    adapter = null;
}
