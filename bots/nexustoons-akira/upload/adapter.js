/**
 * Interface do módulo upload — recebe JSON capturado, envia ao destino Akira Scan.
 *
 * @typedef {import('../shared/schema.js').CapturedChapter} CapturedChapter
 */

/**
 * @typedef {Object} UploadResult
 * @property {boolean} ok
 * @property {string} mangaId
 * @property {string} capId
 * @property {number} pagesSaved
 * @property {string} [error]
 */

/**
 * @typedef {Object} UploadAdapter
 * @property {string} name
 * @property {(chapter: CapturedChapter, meta?: object) => Promise<UploadResult>} uploadChapter
 * @property {(chapters: CapturedChapter[], meta?: object) => Promise<UploadResult[]>} [uploadBatch]
 * @property {() => Promise<void>} [finalize]
 */

/** @type {UploadAdapter|null} */
let adapter = null;

export async function getUploadAdapter(name = process.env.NEXUSTOONS_UPLOAD_ADAPTER || "akira-scan") {
    if (adapter && adapter.name === name) return adapter;
    if (name === "wordpress-madara") {
        const mod = await import("./wordpress-madara.js");
        adapter = mod.createAdapter();
    } else {
        const mod = await import("./akira-scan-api.js");
        adapter = mod.createAdapter();
    }
    return adapter;
}

export async function closeUploadAdapter() {
    adapter = null;
}
