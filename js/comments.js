/**
 * Comentários por mangá — Cloudflare KV (/api/comments) + cache local.
 */
import { cloudApiUrl } from "./site-config.js";
import { temSessaoApi, obterUsernameSessao } from "./user-api.js";
import { resolverPapel, rotuloPapel } from "./services/user-roles.js";

const KEY = "akirascan_comments_v1";

function lerCache() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch {
        return {};
    }
}

function guardarCache(data) {
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
    } catch { /* quota */ }
}

function commentsUrl(mangaId) {
    const base = cloudApiUrl("api/comments");
    if (!mangaId) return base;
    return `${base}?mangaId=${encodeURIComponent(mangaId)}`;
}

function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    try {
        const sess = JSON.parse(localStorage.getItem("akirascan_sessao") || "null");
        if (sess?.token) headers.Authorization = `Bearer ${sess.token}`;
    } catch { /* ignore */ }
    return headers;
}

export function obterComentarios(mangaId) {
    const all = lerCache();
    return (all[mangaId] || []).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export async function carregarComentarios(mangaId) {
    if (!mangaId) return [];
    try {
        const res = await fetch(commentsUrl(mangaId), { headers: { Accept: "application/json" } });
        const data = await res.json();
        if (res.ok && data.ok && Array.isArray(data.comments)) {
            const all = lerCache();
            all[mangaId] = data.comments;
            guardarCache(all);
            return data.comments;
        }
    } catch { /* offline */ }
    return obterComentarios(mangaId);
}

export async function adicionarComentario(mangaId, { texto }) {
    const t = String(texto || "").trim();
    if (!t || !mangaId) return { ok: false, mensagem: "Escreve um comentário." };
    if (!temSessaoApi()) {
        return { ok: false, mensagem: "Inicia sessão para comentar.", needLogin: true };
    }

    try {
        const res = await fetch(commentsUrl(), {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ mangaId, texto: t.slice(0, 800) })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            return { ok: false, mensagem: data.mensagem || "Falha ao publicar.", status: res.status };
        }
        const entry = data.comment;
        const all = lerCache();
        const lista = all[mangaId] || [];
        lista.unshift(entry);
        all[mangaId] = lista.slice(0, 100);
        guardarCache(all);
        return { ok: true, entry };
    } catch {
        return { ok: false, mensagem: "Sem ligação ao servidor." };
    }
}

function avatarUrl(c) {
    const u = String(c?.avatar || "").trim();
    if (u && !u.startsWith("data:")) return u;
    const user = String(c?.username || c?.autor || "").replace(/^@+/, "");
    if (user) return `/api/user/avatar?u=${encodeURIComponent(user)}`;
    if (c?.uid) return `/api/user/avatar?uid=${encodeURIComponent(c.uid)}`;
    return "";
}

function formatTexto(texto, escHtml) {
    const safe = escHtml(texto || "");
    return safe.replace(/@([A-Za-z0-9_]{3,20})/g, '<a class="comment-mention" href="perfil.html">@$1</a>');
}

function renderItem(c, escHtml) {
    const autor = String(c.username || c.autor || "leitor").replace(/^@+/, "") || "leitor";
    const role = resolverPapel({ username: autor, role: c.role });
    const badge = role === "admin" || role === "dev"
        ? `<span class="comment-role comment-role-${role}">${escHtml(rotuloPapel(role))}</span>`
        : "";
    const av = avatarUrl(c);
    const avHtml = av
        ? `<img class="comment-avatar" src="${escHtml(av)}" alt="" width="36" height="36" loading="lazy">`
        : `<span class="comment-avatar comment-avatar-fallback" aria-hidden="true">@</span>`;
    return `
            <article class="comment-item">
                <header class="comment-head">
                    ${avHtml}
                    <div class="comment-head-meta">
                        <span class="comment-author">@${escHtml(autor)}${badge}</span>
                        <time class="comment-time">${new Date(c.ts).toLocaleString("pt-BR")}</time>
                    </div>
                </header>
                <p class="comment-text">${formatTexto(c.texto, escHtml)}</p>
            </article>`;
}

export function renderComentariosSection(mangaId, escHtml, lista = null) {
    const comments = lista || obterComentarios(mangaId);
    const logado = temSessaoApi();
    const user = obterUsernameSessao();
    const items = comments.length
        ? comments.map((c) => renderItem(c, escHtml)).join("")
        : '<p class="msg-vazia comment-empty">Sê o primeiro a comentar.</p>';

    const formHtml = logado
        ? `
        <form class="comment-form" id="comment-form">
            <p class="comment-as">A comentar como <strong>@${escHtml(user || "leitor")}</strong></p>
            <textarea name="texto" class="comment-input-texto" rows="3" placeholder="Escreve um comentário… usa @username para mencionar" maxlength="800" required></textarea>
            <button type="submit" class="btn-akira btn-akira-primary btn-sm">Publicar</button>
        </form>`
        : `
        <p class="comment-login-hint">
            <a href="login.html">Entra na tua conta</a> para comentar com o teu username.
        </p>`;

    return `
    <section class="manga-comments" aria-label="Comentários">
        <h3 class="comments-title">Comentários (<span id="comment-count">${comments.length}</span>)</h3>
        ${formHtml}
        <div class="comment-list" id="comment-list">${items}</div>
    </section>`;
}

export function bindComentarios(container, mangaId, escHtml) {
    const list = container.querySelector("#comment-list");
    const countEl = container.querySelector("#comment-count");
    if (!list) return;

    carregarComentarios(mangaId).then((comments) => {
        list.innerHTML = comments.length
            ? comments.map((c) => renderItem(c, escHtml)).join("")
            : '<p class="msg-vazia comment-empty">Sê o primeiro a comentar.</p>';
        if (countEl) countEl.textContent = String(comments.length);
    });

    const form = container.querySelector("#comment-form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        const res = await adicionarComentario(mangaId, { texto: fd.get("texto") });
        if (btn) btn.disabled = false;

        if (!res.ok) {
            if (res.needLogin) {
                window.location.href = "login.html";
                return;
            }
            alert(res.mensagem || "Falha ao comentar.");
            return;
        }

        form.reset();
        const empty = list.querySelector(".comment-empty");
        if (empty) empty.remove();
        list.insertAdjacentHTML("afterbegin", renderItem(res.entry, escHtml));
        if (countEl) countEl.textContent = String(Number(countEl.textContent || 0) + 1);
    });
}
