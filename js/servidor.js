/**
 * Garante que o site corre via http:// (servidor Node), não file://
 */
export function avisoSeArquivoLocal() {
    if (location.protocol !== "file:") return null;
    return `
        <div class="aviso-servidor">
            <h2>Servidor não iniciado</h2>
            <p>Abriste o ficheiro HTML diretamente. O AkiraScan precisa do servidor local.</p>
            <ol>
                <li>Executa <code>scripts\\iniciar.bat</code></li>
                <li>Abre <a href="http://localhost:5501/biblioteca.html">http://localhost:5501/biblioteca.html</a></li>
            </ol>
        </div>`;
}

export async function pingBiblioteca() {
    try {
        const res = await fetch("/api/biblioteca", { cache: "no-store" });
        if (!res.ok) return { ok: false, erro: `API respondeu ${res.status}` };
        const data = await res.json();
        return { ok: true, total: (data.mangas || []).length };
    } catch {
        return {
            ok: false,
            erro: "Não foi possível ligar ao servidor. Corre scripts\\iniciar.bat"
        };
    }
}
