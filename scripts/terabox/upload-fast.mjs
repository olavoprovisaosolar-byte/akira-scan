/** Modo rápido seguro: 1 cap, 2 arquivos paralelos (3+ pode crashar o Node) */
process.env.TERABOX_CHAPTER_CONCURRENCY = process.env.TERABOX_CHAPTER_CONCURRENCY || "1";
process.env.TERABOX_FILE_CONCURRENCY = process.env.TERABOX_FILE_CONCURRENCY || "2";
process.env.TERABOX_UPLOAD_DELAY_MS = process.env.TERABOX_UPLOAD_DELAY_MS || "0";
process.env.TERABOX_CAP_DELAY_MS = process.env.TERABOX_CAP_DELAY_MS || "100";
process.env.TERABOX_QUIET = process.env.TERABOX_QUIET || "1";
await import("./upload-all.mjs");
