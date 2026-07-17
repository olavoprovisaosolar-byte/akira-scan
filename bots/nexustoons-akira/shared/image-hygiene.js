/**
 * Validação e normalização de imagens com sharp (integridade, tamanho mínimo, AVIF→JPEG).
 */
const MIN_BYTES = Number(process.env.TELEGRA_MIN_BYTES || 100);
const MAX_BYTES = Number(process.env.TELEGRA_MAX_BYTES || 5 * 1024 * 1024);

let sharpPromise = null;

async function getSharp() {
    if (sharpPromise === null) {
        sharpPromise = import("sharp")
            .then((m) => m.default)
            .catch(() => null);
    }
    return sharpPromise;
}

/** Magic bytes básicos (antes do sharp). */
export function basicMagicCheck(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.byteLength < MIN_BYTES) {
        return { ok: false, error: `imagem inválida (${buffer?.byteLength ?? 0} bytes < ${MIN_BYTES})` };
    }
    if (buffer.byteLength > MAX_BYTES) {
        return { ok: false, error: `arquivo excede ${MAX_BYTES} bytes` };
    }
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isGif = buffer[0] === 0x47 && buffer[1] === 0x49;
    const isWebp = buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45;
    const isAvif = buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74;
    if (!isJpeg && !isPng && !isGif && !isWebp && !isAvif) {
        return { ok: false, error: "magic bytes inválidos" };
    }
    return { ok: true };
}

/**
 * Valida integridade via sharp.metadata() e converte AVIF/WebP → JPEG se necessário.
 * @returns {Promise<{ buffer: Buffer, ext: string, contentType: string }>}
 */
export async function validateAndPrepareImage(buffer, extHint = "jpg") {
    const basic = basicMagicCheck(buffer);
    if (!basic.ok) throw new Error(basic.error);

    const sharp = await getSharp();
    const normalized = extHint === "jpeg" ? "jpg" : extHint.toLowerCase();
    const skipReencode = process.env.SHARP_SKIP_REENCODE === "1"
        || process.env.SHARP_SKIP_REENCODE === "true";

    const isJpegMagic = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isWebpMagic = buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45;
    const canSkipReencode = skipReencode
        && buffer.byteLength <= MAX_BYTES
        && ((isJpegMagic && (normalized === "jpg" || normalized === "jpeg"))
            || (isWebpMagic && normalized === "webp"));

    if (sharp) {
        try {
            const meta = await sharp(buffer).metadata();
            if (!meta.width || !meta.height || meta.width < 10 || meta.height < 10) {
                throw new Error(`dimensões inválidas (${meta.width}x${meta.height})`);
            }
            if (canSkipReencode) {
                const fastMime = {
                    jpg: "image/jpeg",
                    jpeg: "image/jpeg",
                    webp: "image/webp"
                };
                return {
                    buffer,
                    ext: normalized,
                    contentType: fastMime[normalized] || "image/jpeg"
                };
            }
        } catch (e) {
            throw new Error(`integridade sharp falhou: ${e.message}`);
        }
    }

    const needsJpeg = normalized === "avif" || normalized === "webp";
    if (needsJpeg && sharp) {
        const out = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
        const recheck = basicMagicCheck(out);
        if (!recheck.ok) throw new Error(recheck.error);
        return { buffer: out, ext: "jpg", contentType: "image/jpeg" };
    }

    const mimeMap = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp"
    };
    return {
        buffer,
        ext: normalized,
        contentType: mimeMap[normalized] || "image/jpeg"
    };
}
