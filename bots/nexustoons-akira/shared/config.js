import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "config.json");

const DEFAULTS = {
    nexustoonsBaseUrl: "https://nexustoons.com",
    akiraScanBaseUrl: "https://akira-scan.pages.dev",
    telegraUploadUrl: "https://api.telegra.ph/upload"
};

function readFileDefaults() {
    if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULTS };
    try {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
    } catch {
        return { ...DEFAULTS };
    }
}

/** @returns {{ nexustoonsBaseUrl: string, akiraScanBaseUrl: string, telegraUploadUrl: string }} */
export function loadConfig() {
    const file = readFileDefaults();
    return {
        nexustoonsBaseUrl: process.env.NEXUSTOONS_BASE_URL || file.nexustoonsBaseUrl,
        akiraScanBaseUrl: process.env.AKIRA_SCAN_BASE_URL || file.akiraScanBaseUrl,
        telegraUploadUrl: process.env.TELEGRA_UPLOAD_URL || file.telegraUploadUrl
    };
}
