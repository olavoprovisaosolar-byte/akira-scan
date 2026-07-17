/**
 * Leitura do índice cloud (data/cloud/chapters-index.json) — Node + re-export worker-safe.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    setIndexOverride,
    getIndexOverride,
    capInfo as capInfoCore,
    capTemTelegra,
    paginasTelegra,
    isLegibleCloudUrl
} from "./cloud-resolver-core.mjs";

export { setIndexOverride, capTemTelegra, paginasTelegra, isLegibleCloudUrl };

let _root = undefined;

function moduleDir() {
    return path.dirname(fileURLToPath(import.meta.url));
}

function getRoot() {
    if (_root !== undefined) return _root;
    const dir = moduleDir();
    const candidates = [
        process.cwd(),
        path.join(dir, "..", ".."),
        path.join("/var/task"),
        path.join("/var/task/repository")
    ];
    for (const root of candidates) {
        if (fs.existsSync(path.join(root, "data", "cloud", "chapters-index.json"))) {
            _root = root;
            return _root;
        }
    }
    _root = path.join(dir, "..", "..");
    return _root;
}

function lerIndiceNode() {
    if (getIndexOverride()) return getIndexOverride();
    const ROOT = getRoot();
    const p = path.join(ROOT, "data", "cloud", "chapters-index.json");
    if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    return { caps: {} };
}

export function capInfo(mangaId, capId) {
    if (getIndexOverride()) return capInfoCore(mangaId, capId);
    const idx = lerIndiceNode();
    return idx.caps?.[`${mangaId}/${capId}`] || null;
}
