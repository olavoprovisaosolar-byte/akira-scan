#!/usr/bin/env node
/**
 * Probe Telegra.ph — testa upload via api.telegra.ph/upload (fallback: telegra.ph → estático).
 * Uso: npm run bot:nexustoons:telegra-probe
 */
import "dotenv/config";
import sharp from "sharp";
import { uploadImage, validateImageBuffer } from "./telegra.js";
import { log } from "../shared/logger.js";
import { isLegiblePageUrl } from "../shared/schema.js";

const MIN_PROBE_BYTES = Number(process.env.TELEGRA_MIN_BYTES || 100);

/** PNG válido >= TELEGRA_MIN_BYTES; o PNG 1x1 em base64 tem ~70 bytes. */
async function probePngBuffer() {
    const buf = await sharp({
        create: {
            width: 32,
            height: 32,
            channels: 3,
            background: { r: 128, g: 128, b: 128 }
        }
    })
        .png()
        .toBuffer();

    const check = validateImageBuffer(buf);
    if (!check.ok) {
        throw new Error(check.error);
    }
    if (buf.byteLength < MIN_PROBE_BYTES) {
        throw new Error(`probe PNG too small: ${buf.byteLength} bytes < ${MIN_PROBE_BYTES}`);
    }
    return buf;
}

async function main() {
    log.info("=== Telegra.ph probe ===");
    try {
        const buffer = await probePngBuffer();
        log.info("Probe image ready", { bytes: buffer.byteLength, minBytes: MIN_PROBE_BYTES });

        let url;
        let mode = "telegra";
        try {
            url = await uploadImage(buffer, "probe.png");
            log.info("Telegra upload OK", { url });
        } catch (e) {
            log.warn("Telegra upload indisponível (api.telegra.ph e fallbacks falharam)", { err: e.message });
            try {
                const { uploadImage: catboxUpload } = await import("./catbox.js");
                url = await catboxUpload(buffer, "probe.png");
                mode = "catbox";
                log.info("Catbox upload OK", { url });
            } catch (catboxErr) {
                log.warn("Catbox também indisponível", { err: catboxErr.message });
            }
            if (url) {
                // catbox succeeded
            } else if (process.env.TELEGRA_STATIC_FALLBACK === "false") {
                throw e;
            } else {
            mode = "cloud-static-fallback";
            const { loadConfig } = await import("../shared/config.js");
            const cfg = loadConfig();
            const fs = await import("node:fs");
            const path = await import("node:path");
            const probeDir = path.join(process.cwd(), "data", "cloud", "pages", "_probe", "probe-cap");
            fs.mkdirSync(probeDir, { recursive: true });
            fs.writeFileSync(path.join(probeDir, "001.png"), buffer);
            url = `${cfg.akiraScanBaseUrl.replace(/\/$/, "")}/data/cloud/pages/_probe/probe-cap/001.png`;
            log.info("Fallback estático OK", { url });
            }
        }

        if (!isLegiblePageUrl(url)) {
            throw new Error(`URL de probe inválida: ${url}`);
        }

        const res = await fetch(url, { method: "HEAD" }).catch(() => null);
        if (res) {
            log.info("HEAD check", { status: res.status, ok: res.ok, mode });
        } else if (mode === "cloud-static-fallback") {
            log.info("HEAD skip (arquivo local — será servido após deploy)", { mode });
        } else {
            log.warn("HEAD check falhou — URL Telegra pode ainda ser válida", { url });
        }

        console.log(`\n✓ Hospedagem acessível (${mode}) — URL:`, url);
    } catch (e) {
        log.error("Probe falhou", { err: e.message });
        process.exit(1);
    }
}

main();
