import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");
export const MANIFEST_PATH = path.join(ROOT, "data", "nexustoons", "manifest.json");

const EMPTY = { version: 1, updatedAt: null, mangas: {} };

export function loadManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return { ...EMPTY, mangas: {} };
    try {
        return { ...EMPTY, ...JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) };
    } catch {
        return { ...EMPTY, mangas: {} };
    }
}

export function saveManifest(manifest) {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

export function getMangaEntry(manifest, nexusSlug) {
    return manifest.mangas[nexusSlug] || null;
}

export function upsertMangaEntry(manifest, nexusSlug, patch) {
    const prev = manifest.mangas[nexusSlug] || { chapters: {} };
    manifest.mangas[nexusSlug] = {
        ...prev,
        ...patch,
        chapters: { ...(prev.chapters || {}), ...(patch.chapters || {}) }
    };
    return manifest.mangas[nexusSlug];
}

export function isChapterKnown(manifest, nexusSlug, chapterNumber) {
    const entry = getMangaEntry(manifest, nexusSlug);
    if (!entry?.chapters) return false;
    return Boolean(entry.chapters[String(chapterNumber)]);
}

export function markChapter(manifest, nexusSlug, chapterNumber, data) {
    const entry = upsertMangaEntry(manifest, nexusSlug, {});
    entry.chapters[String(chapterNumber)] = {
        ...(entry.chapters[String(chapterNumber)] || {}),
        ...data,
        updatedAt: new Date().toISOString()
    };
    return entry;
}

export function diffNewChapters(manifest, nexusSlug, remoteChapters) {
    const known = getMangaEntry(manifest, nexusSlug)?.chapters || {};
    return remoteChapters.filter((ch) => {
        const num = String(ch.number ?? ch.numero);
        return !known[num]?.captured;
    });
}
