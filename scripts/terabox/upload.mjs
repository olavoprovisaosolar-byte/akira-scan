/**
 * Upload de arquivos locais → Terabox.
 *
 * Uso:
 *   node scripts/terabox/upload.mjs --file=./cap.zip
 *   node scripts/terabox/upload.mjs --file=./cap.zip --dir=/meus_mangas/ObraX
 *   node scripts/terabox/upload.mjs --dir=./data/toonlivre-backup/mangas/obra-xxx/chapters/cap-yyy/pages
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
    criarCliente,
    garantirPasta,
    lerConfig,
    sleep,
    withTeraboxRetry
} from "./client.mjs";
import { uploadArquivo, uploadPasta, unwrapErrorMessage } from "./upload-lib.mjs";

function argValue(flag) {
    return process.argv.find((a) => a.startsWith(`${flag}=`))?.split("=").slice(1).join("=") || "";
}

async function main() {
    const cfg = lerConfig();
    const fileArg = argValue("--file");
    const dirArg = argValue("--dir");
    const remoteDir = argValue("--remote") || cfg.remoteDir;

    if (!fileArg && !dirArg) {
        console.error("Uso: --file=caminho/arquivo  ou  --dir=pasta/local [--remote=/meus_mangas]");
        process.exit(1);
    }

    const client = await criarCliente();
    await garantirPasta(client, remoteDir);

    if (fileArg) {
        const localPath = path.resolve(fileArg);
        if (!fs.existsSync(localPath)) {
            console.error(`Arquivo não encontrado: ${localPath}`);
            process.exit(1);
        }
        console.log(`Upload: ${localPath} → ${remoteDir}`);
        const r = await uploadArquivo(client, localPath, remoteDir);
        console.log(r.rapid ? "✓ Rapid upload (já existia no servidor)" : "✓ Upload concluído");
        console.log(`  ${r.path}`);
        return;
    }

    const localDir = path.resolve(dirArg);
    if (!fs.existsSync(localDir) || !fs.statSync(localDir).isDirectory()) {
        console.error(`Pasta não encontrada: ${localDir}`);
        process.exit(1);
    }

    console.log(`Upload pasta: ${localDir} → ${remoteDir}`);
    const resultados = await uploadPasta(client, localDir, remoteDir, cfg.delayMs);
    const ok = resultados.filter((r) => r.ok).length;
    console.log(`Concluído: ${ok}/${resultados.length} arquivos`);
}

main().catch((e) => {
    console.error("FATAL:", unwrapErrorMessage(e) || e.message);
    process.exit(1);
});
