import { obterOuCachearCapitulo } from "./chapter-cache.mjs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = await obterOuCachearCapitulo(ROOT, "obra-69466adb", "cap-d501f6c4-35", "35");
console.log("pages", pages?.length ?? 0, pages?.[0]?.url?.slice(0, 60));
