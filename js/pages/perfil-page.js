/**
 * Perfil — avatar, nome, favoritos e histórico.
 */
import { renderHeader, renderFooter, renderFavoritoCard, initShell, escHtml } from "../app-shell.js";
import {
    obterContinuarLista, obterFavoritos, limparHistorico,
    obterPerfil, guardarPerfil, obterHistorico
} from "../storage.js";
import { obterManga } from "../services/data-service.js";
import { linkManhwa, linkLeitor } from "../core/router.js";
import { normalizarNumeroProgresso } from "../services/chapter-label.js";
import { coverImgTagAttrs } from "../services/cover-utils.js";
import { temSessaoApi } from "../user-api.js";

const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23141419'/%3E%3Ctext x='48' y='58' text-anchor='middle' font-size='40' fill='%239d00ff'%3E%3F%3C/text%3E%3C/svg%3E";

function atualizarSubtitulo(nome) {
    const el = document.getElementById("perfil-sub");
    if (el) el.textContent = nome ? `Olá, ${nome}` : "Leitor AkiraScan";
}

function comprimirAvatar(dataUrl, maxPx = 128) {
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

function guardarNome(nomeEl) {
    try {
        guardarPerfil({ nome: nomeEl.value });
        atualizarSubtitulo(nomeEl.value.trim());
    } catch (e) {
        alert(e.message || "Não foi possível guardar o nome.");
    }
}

export async function initPerfilPage() {
    document.getElementById("header-slot").innerHTML = renderHeader();
    document.getElementById("footer-slot").innerHTML = renderFooter();
    await initShell();

    const perfil = obterPerfil();
    const avatarEl = document.getElementById("perfil-avatar");
    const nomeEl = document.getElementById("perfil-nome");

    avatarEl.src = perfil.avatar || DEFAULT_AVATAR;
    nomeEl.value = perfil.nome || "";
    atualizarSubtitulo(perfil.nome);

    if (temSessaoApi()) {
        document.getElementById("perfil-login-link").textContent = "✓ Sessão ativa — dados sincronizados";
    }

    let nomeTimer;
    nomeEl.addEventListener("input", () => {
        clearTimeout(nomeTimer);
        nomeTimer = setTimeout(() => guardarNome(nomeEl), 400);
    });
    nomeEl.addEventListener("blur", () => guardarNome(nomeEl));

    document.getElementById("perfil-avatar-input").addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            alert("Imagem demasiado grande — máximo 2 MB.");
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const comprimido = await comprimirAvatar(reader.result);
                guardarPerfil({ avatar: comprimido });
                avatarEl.src = comprimido;
            } catch (err) {
                alert(err.message || "Não foi possível guardar a foto.");
            }
        };
        reader.readAsDataURL(file);
    });

    const continuar = obterContinuarLista();
    const favoritos = obterFavoritos();
    const historico = obterHistorico();
    document.getElementById("stat-lendo").textContent = continuar.length;
    document.getElementById("stat-fav").textContent = favoritos.length;

    const secContinuar = document.getElementById("sec-continuar-perfil");
    const elCont = document.getElementById("lista-continuar");
    if (!continuar.length) {
        secContinuar?.classList.add("escondido");
    } else {
        secContinuar?.classList.remove("escondido");
        elCont.innerHTML = continuar.map((h) => {
            const capNum = normalizarNumeroProgresso(h.capitulo_atual, h.chapterId);
            const href = h.chapterId
                ? linkLeitor(h.mangaId, capNum, h.chapterId) + (h.paginaAtual > 1 ? `&p=${h.paginaAtual}` : "")
                : linkManhwa(h.mangaId);
            const img = coverImgTagAttrs({ id: h.mangaId, titulo: h.titulo, capa: h.capa }, { loading: "lazy" });
            return `
            <a href="${href}" class="card-continuar" data-manga-id="${escHtml(h.mangaId)}">
                <img ${img.html}>
                <div class="card-continuar-body">
                    <h3>${escHtml(h.titulo)}</h3>
                    <span class="card-continuar-cap">Cap. ${capNum}${h.progresso ? ` · ${h.progresso}%` : ""}</span>
                </div>
            </a>`;
        }).join("");
    }

    const elFav = document.getElementById("lista-favoritos");
    if (!favoritos.length) {
        elFav.innerHTML = '<p class="msg-vazia">Adiciona favoritos nas páginas dos mangás — aparecem aqui com capa e progresso.</p>';
    } else {
        for (const id of favoritos) {
            try {
                const m = await obterManga(id);
                elFav.insertAdjacentHTML("beforeend", renderFavoritoCard(m, historico[id]));
            } catch { /* skip */ }
        }
    }

    document.getElementById("btn-limpar").addEventListener("click", () => {
        if (confirm("Limpar todo o histórico de leitura?")) {
            limparHistorico();
            location.reload();
        }
    });
}
