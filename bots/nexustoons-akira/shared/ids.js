import crypto from "node:crypto";

/** Gera obra-xxxxxxxx determinístico a partir do slug NexusToons. */
export function akiraMangaId(nexusSlug, explicitId) {
    if (explicitId) return explicitId;
    const hash = crypto.createHash("sha256").update(`nexustoons:${nexusSlug}`).digest("hex").slice(0, 8);
    return `obra-${hash}`;
}

/** Gera cap-xxxxxxxx-NN a partir do mangaId Akira + número do capítulo. */
export function akiraCapId(mangaId, numero) {
    const hash = crypto.createHash("sha256").update(`${mangaId}:${numero}`).digest("hex").slice(0, 8);
    const numLabel = String(numero).includes(".")
        ? String(numero)
        : String(Math.floor(Number(numero))).padStart(2, "0");
    return `cap-${hash}-${numLabel}`;
}
