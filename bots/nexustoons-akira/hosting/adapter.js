/**
 * Interface do módulo hosting — recebe JSON capturado, retorna JSON com URLs hospedadas.
 *
 * @typedef {import('../shared/schema.js').CapturedChapter} CapturedChapter
 * @typedef {import('../shared/schema.js').HostedChapter} HostedChapter
 */

/**
 * @typedef {Object} HostingResult
 * @property {boolean} ok
 * @property {HostedChapter|null} chapter
 * @property {number} pagesHosted
 * @property {number} pagesSkipped
 * @property {string} [error]
 */

/**
 * @typedef {Object} HostingAdapter
 * @property {string} name
 * @property {(chapter: CapturedChapter, meta?: object) => Promise<HostingResult>} hostChapter
 */

/** @type {HostingAdapter|null} */
let adapter = null;
let adapterName = null;

function resolveHostingAdapterName(name) {
    return name
        || process.env.HOSTING_ADAPTER
        || process.env.NEXUSTOONS_HOSTING_ADAPTER
        || "telegra";
}

export async function getHostingAdapter(name) {
    const resolved = resolveHostingAdapterName(name);
    if (adapter && adapterName === resolved) return adapter;
    adapter = null;
    adapterName = resolved;

    if (resolved === "telegra") {
        const mod = await import("./telegra.js");
        adapter = mod.createAdapter();
    } else if (resolved === "cloud-static") {
        const mod = await import("./cloud-static.js");
        adapter = mod.createAdapter();
    } else if (resolved === "catbox") {
        const mod = await import("./catbox.js");
        adapter = mod.createAdapter();
    } else {
        throw new Error(`Hosting adapter desconhecido: ${resolved} (telegra | cloud-static | catbox)`);
    }
    return adapter;
}

export async function closeHostingAdapter() {
    adapter = null;
    adapterName = null;
}
