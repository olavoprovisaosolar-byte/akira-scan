/**
 * Comentários por mangá — localStorage (sem backend).
 */
const KEY = "akirascan_comments_v1";

function ler() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch {
        return {};
    }
}

function guardar(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
}

export function obterComentarios(mangaId) {
    const all = ler();
    return (all[mangaId] || []).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export function adicionarComentario(mangaId, { autor, texto }) {
    const t = String(texto || "").trim();
    if (!t || !mangaId) return null;
    const all = ler();
    const lista = all[mangaId] || [];
    const entry = {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        autor: String(autor || "Leitor").trim().slice(0, 32) || "Leitor",
        texto: t.slice(0, 800),
        ts: Date.now()
    };
    lista.unshift(entry);
    all[mangaId] = lista.slice(0, 100);
    guardar(all);
    return entry;
}

export function renderComentariosSection(mangaId, escHtml) {
    const lista = obterComentarios(mangaId);
    const items = lista.length
        ? lista.map((c) => `
            <article class="comment-item">
                <header class="comment-head">
                    <span class="comment-author">${escHtml(c.autor)}</span>
                    <time class="comment-time">${new Date(c.ts).toLocaleString("pt-BR")}</time>
                </header>
                <p class="comment-text">${escHtml(c.texto)}</p>
            </article>`).join("")
        : '<p class="msg-vazia comment-empty">Sê o primeiro a comentar.</p>';

    return `
    <section class="manga-comments" aria-label="Comentários">
        <h3 class="comments-title">Comentários (${lista.length})</h3>
        <form class="comment-form" id="comment-form">
            <input type="text" name="autor" class="comment-input-autor" placeholder="Teu nome" maxlength="32" autocomplete="nickname">
            <textarea name="texto" class="comment-input-texto" rows="3" placeholder="Escreve um comentário…" maxlength="800" required></textarea>
            <button type="submit" class="btn-akira btn-akira-primary btn-sm">Publicar</button>
        </form>
        <div class="comment-list" id="comment-list">${items}</div>
    </section>`;
}

export function bindComentarios(container, mangaId, escHtml, getAutorPadrao) {
    const form = container.querySelector("#comment-form");
    const list = container.querySelector("#comment-list");
    if (!form || !list) return;

    const autorInput = form.querySelector('[name="autor"]');
    const perfilNome = getAutorPadrao?.();
    if (perfilNome && autorInput) autorInput.value = perfilNome;

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const entry = adicionarComentario(mangaId, {
            autor: fd.get("autor"),
            texto: fd.get("texto")
        });
        if (!entry) return;
        form.querySelector('[name="texto"]').value = "";
        const empty = list.querySelector(".comment-empty");
        empty?.remove();
        list.insertAdjacentHTML("afterbegin", `
            <article class="comment-item">
                <header class="comment-head">
                    <span class="comment-author">${escHtml(entry.autor)}</span>
                    <time class="comment-time">${new Date(entry.ts).toLocaleString("pt-BR")}</time>
                </header>
                <p class="comment-text">${escHtml(entry.texto)}</p>
            </article>`);
        const title = container.querySelector(".comments-title");
        if (title) title.textContent = `Comentários (${obterComentarios(mangaId).length})`;
    });
}
