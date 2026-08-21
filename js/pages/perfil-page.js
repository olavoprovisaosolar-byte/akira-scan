/**
 * Perfil — painel estilo referência (hero + settings + listas).
 */
import { renderHeader, renderFooter, initShell, escHtml } from "../app-shell.js";
import {
    obterContinuarLista, obterFavoritos, limparHistorico,
    obterPerfil, guardarPerfil, obterHistorico, sincronizarComNuvem
} from "../storage.js";
import { obterManga } from "../services/data-service.js";
import { linkManhwa, linkLeitor } from "../core/router.js";
import { normalizarNumeroProgresso } from "../services/chapter-label.js";
import { coverImgTagAttrs } from "../services/cover-utils.js";
import { temSessaoApi, apiValidarSessao, obterUsernameSessao, apiAtualizarUsername, apiUploadAvatar } from "../user-api.js";
import { definirSessao, lerSessaoLocal, entrarLocal } from "../local-auth.js";
import { resolverPapel, rotuloPapel } from "../services/user-roles.js";
import {
    THEME_SWATCHES,
    obterPrefs,
    guardarPrefs,
    aplicarAccent,
    initAccentFromPrefs,
    tocarVisita,
    idsPorStatus,
    formatarDataCurta,
    formatarVisitaRelativa
} from "../perfil-prefs.js";

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23141419'/%3E%3Ctext x='48' y='58' text-anchor='middle' font-size='40' fill='%23A855F7'%3E%3F%3C/text%3E%3C/svg%3E";

function comprimirImagem(dataUrl, maxPx = 128) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxPx / Math.max(img.width, img.height, 1));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function continuarHref(h) {
    const capNum = normalizarNumeroProgresso(h.capitulo_atual, h.chapterId);
    if (h.chapterId) {
        let url = linkLeitor(h.mangaId, capNum, h.chapterId);
        if (h.paginaAtual > 1) url += `${url.includes("?") ? "&" : "?"}p=${h.paginaAtual}`;
        return url;
    }
    return linkManhwa(h.mangaId);
}

function renderMangaCard(item, { showContinuar = true } = {}) {
    const capNum = normalizarNumeroProgresso(item.capitulo_atual, item.chapterId);
    const img = coverImgTagAttrs(
        { id: item.mangaId || item.id, titulo: item.titulo, capa: item.capa },
        { loading: "lazy" }
    );
    const when = item.atualizadoEm
        ? formatarVisitaRelativa(new Date(item.atualizadoEm).toISOString())
        : (item.data || "");
    const href = showContinuar ? continuarHref(item) : linkManhwa(item.mangaId || item.id);

    return `
    <article class="perfil-manga-card">
        <a href="${linkManhwa(item.mangaId || item.id)}"><img ${img.html} alt=""></a>
        <div class="perfil-manga-meta">
            <h3>${escHtml(item.titulo || item.mangaId || "Obra")}</h3>
            <p>Capítulo ${escHtml(String(capNum ?? "—"))}</p>
            ${when ? `<p><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Última leitura: ${escHtml(when)}</p>` : ""}
        </div>
        <div class="perfil-manga-actions">
            ${showContinuar ? `<a class="perfil-btn-continuar" href="${href}">Continuar</a>` : `<a class="perfil-btn-continuar" href="${href}">Ver obra</a>`}
        </div>
    </article>`;
}

async function resolveFavoritosCards(favoritos, historico) {
    const out = [];
    for (const id of favoritos) {
        const h = historico[id];
        if (h) {
            out.push({ ...h, mangaId: id });
            continue;
        }
        try {
            const m = await obterManga(id);
            out.push({
                mangaId: id,
                titulo: m.titulo,
                capa: m.capa,
                capitulo_atual: m.capitulos?.[0]?.numero || 1
            });
        } catch { /* skip */ }
    }
    return out;
}

async function resolveStatusCards(status, historico) {
    const ids = idsPorStatus(status);
    const out = [];
    for (const id of ids) {
        const h = historico[id];
        if (h) {
            out.push({ ...h, mangaId: id });
            continue;
        }
        try {
            const m = await obterManga(id);
            out.push({ mangaId: id, titulo: m.titulo, capa: m.capa, capitulo_atual: "—" });
        } catch {
            out.push({ mangaId: id, titulo: id, capa: "", capitulo_atual: "—" });
        }
    }
    return out;
}

function lidosDoHistorico(historico) {
    return Object.entries(historico)
        .filter(([, h]) => Number(h.progresso) >= 95 || h.status === "lido" || h.concluido)
        .map(([mangaId, h]) => ({ ...h, mangaId }));
}

function mergeCardsById(...lists) {
    const map = new Map();
    for (const list of lists) {
        for (const it of list || []) {
            const id = it.mangaId || it.id;
            if (!id || map.has(id)) continue;
            map.set(id, { ...it, mangaId: id });
        }
    }
    return [...map.values()];
}

export async function initPerfilPage() {
    document.getElementById("header-slot").innerHTML = renderHeader();
    document.getElementById("footer-slot").innerHTML = renderFooter();
    await initShell();
    initAccentFromPrefs();
    const prefs = tocarVisita();

    if (temSessaoApi()) {
        try {
            const sessCloud = await apiValidarSessao();
            if (sessCloud?.username) {
                const s = lerSessaoLocal();
                if (s) definirSessao({ ...s, username: sessCloud.username, role: sessCloud.role || s.role });
                guardarPerfil({
                    ...obterPerfil(),
                    username: sessCloud.username,
                    nome: obterPerfil().nome || sessCloud.username,
                    avatar: sessCloud.perfil?.avatar || obterPerfil().avatar
                });
            }
            await sincronizarComNuvem();
        } catch { /* offline */ }
    }

    const perfil = obterPerfil();
    const sess = lerSessaoLocal();
    const avatarEl = document.getElementById("perfil-avatar");
    const nomeEl = document.getElementById("perfil-nome");
    const handleEl = document.getElementById("perfil-handle");
    const emailEl = document.getElementById("perfil-email");
    const loginLink = document.getElementById("perfil-login-link");

    const displayName = perfil.username || obterUsernameSessao() || perfil.nome || sess?.username || "Leitor";
    const handle = String(displayName || "leitor").replace(/^@+/, "") || "leitor";
    const role = resolverPapel({ email: sess?.email, username: handle, role: sess?.role });
    avatarEl.src = perfil.avatar || DEFAULT_AVATAR;
    nomeEl.textContent = displayName;
    if (handleEl) handleEl.textContent = `@${handle}`;
    emailEl.textContent = sess?.email || "Sem e-mail na sessão";
    const roleEl = document.getElementById("perfil-role");
    if (roleEl) {
        roleEl.textContent = `● ${rotuloPapel(role)}`;
        roleEl.dataset.role = role;
        roleEl.classList.toggle("is-staff", role === "admin" || role === "dev");
    }
    document.getElementById("perfil-cadastrado").textContent =
        `● Cadastrado: ${formatarDataCurta(prefs.cadastradoEm)}`;
    document.getElementById("perfil-visita").textContent =
        `● Última visita: ${formatarVisitaRelativa(prefs.ultimaVisita)}`;

    if (temSessaoApi() || sess) {
        loginLink.textContent = "Sessão ativa";
        loginLink.href = "#";
        loginLink.addEventListener("click", (e) => e.preventDefault());
    }

    document.getElementById("perfil-username").value = perfil.username || obterUsernameSessao() || "";

    // Settings toggle
    const settings = document.getElementById("perfil-settings");
    document.getElementById("btn-abrir-config").addEventListener("click", () => {
        settings.hidden = !settings.hidden;
        if (!settings.hidden) settings.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (sessionStorage.getItem("akira_open_config") === "1") {
        sessionStorage.removeItem("akira_open_config");
        settings.hidden = false;
        requestAnimationFrame(() => settings.scrollIntoView({ behavior: "smooth", block: "start" }));
    }

    // Theme swatches
    const swatches = document.getElementById("theme-swatches");
    const currentAccent = obterPrefs().accent || "violet";
    swatches.innerHTML = THEME_SWATCHES.map((s) => `
        <button type="button" class="perfil-swatch${s.id === currentAccent ? " ativo" : ""}" data-accent="${s.id}" role="option" aria-selected="${s.id === currentAccent}">
            <i style="background:${s.color}"></i>
            ${escHtml(s.label)}
        </button>`).join("");
    swatches.addEventListener("click", (e) => {
        const btn = e.target.closest(".perfil-swatch");
        if (!btn) return;
        aplicarAccent(btn.dataset.accent);
        swatches.querySelectorAll(".perfil-swatch").forEach((el) => {
            el.classList.toggle("ativo", el === btn);
            el.setAttribute("aria-selected", el === btn ? "true" : "false");
        });
    });

    // Toggles
    const notif = document.getElementById("pref-notif-comments");
    const showCont = document.getElementById("pref-show-continuar");
    notif.checked = prefs.notifComments !== false;
    showCont.checked = prefs.showContinuarHome !== false;
    notif.addEventListener("change", () => guardarPrefs({ notifComments: notif.checked }));
    showCont.addEventListener("change", () => guardarPrefs({ showContinuarHome: showCont.checked }));

    // Username
    document.getElementById("btn-salvar-username").addEventListener("click", async () => {
        const input = document.getElementById("perfil-username");
        const raw = input.value.trim().replace(/^@+/, "");
        input.value = raw;
        if (!temSessaoApi()) {
            guardarPerfil({ ...obterPerfil(), username: raw, nome: obterPerfil().nome || raw });
            nomeEl.textContent = raw || "Leitor";
            return;
        }
        const res = await apiAtualizarUsername(raw);
        if (!res.ok) {
            alert(res.mensagem || "Username indisponível.");
            return;
        }
        guardarPerfil({ ...obterPerfil(), username: res.username, nome: obterPerfil().nome || res.username });
        const s = lerSessaoLocal();
        if (s) definirSessao({ ...s, username: res.username });
        nomeEl.textContent = res.username;
        const handleEl2 = document.getElementById("perfil-handle");
        if (handleEl2) handleEl2.textContent = `@${res.username}`;
    });

    // Avatar
    document.getElementById("perfil-avatar-input").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file || file.size > 2 * 1024 * 1024) {
            alert("Imagem demasiado grande — máximo 2 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            const comprimido = await comprimirImagem(reader.result, 128);
            if (temSessaoApi()) {
                const res = await apiUploadAvatar(comprimido);
                if (res.ok && res.url) {
                    guardarPerfil({ ...obterPerfil(), avatar: res.url });
                    avatarEl.src = res.url;
                    const headerAv = document.getElementById("header-avatar");
                    if (headerAv) headerAv.src = res.url;
                    return;
                }
            }
            guardarPerfil({ ...obterPerfil(), avatar: comprimido });
            avatarEl.src = comprimido;
        };
        reader.readAsDataURL(file);
    });

    // Password dialog (local accounts)
    const dialog = document.getElementById("dialog-senha");
    document.getElementById("btn-alterar-senha").addEventListener("click", () => dialog.showModal());
    document.getElementById("btn-senha-cancelar").addEventListener("click", () => dialog.close());
    document.getElementById("form-senha").addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const atual = String(fd.get("atual") || "");
        const nova = String(fd.get("nova") || "");
        const confirma = String(fd.get("confirma") || "");
        const status = document.getElementById("senha-status");
        status.hidden = false;
        if (nova !== confirma) {
            status.textContent = "As senhas não coincidem.";
            return;
        }
        if (!sess?.email) {
            status.textContent = temSessaoApi()
                ? "A alteração de senha da conta na nuvem ainda não está disponível."
                : "Entra na conta para alterar a senha.";
            return;
        }
        const login = entrarLocal(sess.email, atual);
        if (!login.ok) {
            status.textContent = "Senha atual incorreta.";
            return;
        }
        try {
            const users = JSON.parse(localStorage.getItem("akirascan_usuarios") || "{}");
            if (users[sess.email]) {
                users[sess.email].senha = nova;
                localStorage.setItem("akirascan_usuarios", JSON.stringify(users));
            }
            status.textContent = "Senha atualizada (conta local).";
            setTimeout(() => dialog.close(), 800);
        } catch {
            status.textContent = "Não foi possível guardar.";
        }
    });

    document.getElementById("btn-limpar").addEventListener("click", () => {
        if (confirm("Limpar todo o histórico de leitura?")) {
            limparHistorico();
            location.reload();
        }
    });

    // Lists
    const historico = obterHistorico();
    const favoritos = obterFavoritos();
    const continuar = obterContinuarLista();
    const lidosHist = lidosDoHistorico(historico);
    const lendoStatus = await resolveStatusCards("lendo", historico);
    const lidoStatus = await resolveStatusCards("lido", historico);
    const lendo = mergeCardsById(continuar, lendoStatus);
    const lidos = mergeCardsById(lidosHist, lidoStatus);

    const counts = {
        lendo: lendo.length,
        favoritos: favoritos.length,
        lido: lidos.length,
        interessado: idsPorStatus("interessado").length,
        pausado: idsPorStatus("pausado").length,
        dropado: idsPorStatus("dropado").length
    };
    Object.entries(counts).forEach(([k, v]) => {
        const el = document.getElementById(`count-${k}`);
        if (el) el.textContent = String(v);
    });

    const listEl = document.getElementById("perfil-list");
    let active = "lendo";

    async function renderList(key) {
        active = key;
        document.querySelectorAll(".perfil-status-tab").forEach((t) => {
            t.classList.toggle("ativo", t.dataset.list === key);
        });

        let items = [];
        if (key === "lendo") items = lendo;
        else if (key === "favoritos") items = await resolveFavoritosCards(favoritos, historico);
        else if (key === "lido") items = lidos;
        else items = await resolveStatusCards(key, historico);

        if (!items.length) {
            listEl.innerHTML = `<p class="perfil-empty">Nada em “${escHtml(key)}” por agora.</p>`;
            return;
        }
        listEl.innerHTML = items.map((it) => renderMangaCard(it, { showContinuar: key === "lendo" || key === "favoritos" })).join("");
    }

    document.getElementById("perfil-status-bar").addEventListener("click", (e) => {
        const tab = e.target.closest(".perfil-status-tab");
        if (!tab) return;
        renderList(tab.dataset.list);
    });

    await renderList("lendo");
}
