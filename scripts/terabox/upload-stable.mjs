/** Modo estável: 1 cap, 1 arquivo por vez — evita crash do terabox-api (stdout paralelo) */
process.env.TERABOX_CHAPTER_CONCURRENCY = process.env.TERABOX_CHAPTER_CONCURRENCY || "1";
process.env.TERABOX_FILE_CONCURRENCY = process.env.TERABOX_FILE_CONCURRENCY || "1";
process.env.TERABOX_UPLOAD_DELAY_MS = process.env.TERABOX_UPLOAD_DELAY_MS || "100";
process.env.TERABOX_CAP_DELAY_MS = process.env.TERABOX_CAP_DELAY_MS || "200";
process.env.TERABOX_QUIET = process.env.TERABOX_QUIET || "1";
await import("./upload-all.mjs");
