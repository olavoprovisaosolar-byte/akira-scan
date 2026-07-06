import { obterPaginasCapituloServidor } from "../netlify/functions/catalogo.mjs";

try {
    const pages = await obterPaginasCapituloServidor("obra-69466adb", "capitulo-01", "1", {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0"
    });
    console.log("OK pages:", pages.length);
    console.log("first:", pages[0]);
} catch (e) {
    console.error("ERR:", e.message);
    console.error(e.stack);
}
