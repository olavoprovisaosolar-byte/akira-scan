const PIN_KEY = "akira_mobile_pin";
const API = "/api/mobile";

function getPin() {
    return sessionStorage.getItem(PIN_KEY) || new URLSearchParams(location.search).get("pin") || "";
}

function headers() {
    return { "Content-Type": "application/json", "X-Mobile-Pin": getPin() };
}

async function api(path, opts = {}) {
    const r = await fetch(`${API}${path}`, {
        ...opts,
        headers: { ...headers(), ...(opts.headers || {}) }
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok && !d.error) d.error = `HTTP ${r.status}`;
    return d;
}

function log(el, msg, cls = "") {
    el.textContent = msg;
    el.className = "log " + cls;
}

function showPanel(id) {
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
    document.querySelector(`.tab[data-panel="${id}"]`)?.classList.add("active");
}

function fmtWf(wf) {
    if (!wf) return "Nenhuma execução recente";
    const st = wf.status === "completed"
        ? (wf.conclusion === "success" ? "✓ concluído" : "✗ " + (wf.conclusion || "falhou"))
        : wf.status === "in_progress" ? "⏳ em andamento" : wf.status;
    return `${st} · ${new Date(wf.createdAt).toLocaleString("pt-BR")}`;
}

async function refreshHome() {
    const msg = document.getElementById("home-msg");
    try {
        const d = await api("/dashboard");
        if (!d.ok && d.error) throw new Error(d.error);

        const s = d.stats || {};
        document.getElementById("stat-caps").textContent = s.capsLegivel ?? s.capsIndex ?? d.cloud?.total ?? "—";
        document.getElementById("stat-mangas").textContent = d.mangas?.enabled ?? "—";
        document.getElementById("stat-pending").textContent = d.mangas?.pending ?? "—";
        document.getElementById("stat-state").textContent = s.capsState ?? "—";

        document.getElementById("wf-status").textContent = fmtWf(d.workflow);
        if (d.workflow?.url) document.getElementById("link-actions").href = d.workflow.url;

        const cloudOk = d.cloud?.ok !== false && !d.cloud?.error;
        document.getElementById("cloud-status").textContent = cloudOk
            ? `Cloud OK · ${d.cloud?.total ?? s.capsIndex ?? "?"} caps no índice`
            : `Cloud: ${d.cloud?.error || "indisponível"}`;

        log(msg, "Atualizado " + new Date().toLocaleTimeString("pt-BR"), "ok");
    } catch (e) {
        log(msg, "Erro: " + e.message, "err");
    }
}

async function trigger(body, msgEl) {
    const msg = msgEl || document.getElementById("home-msg");
    log(msg, "Disparando na nuvem…");
    try {
        const d = await api("/trigger", { method: "POST", body: JSON.stringify(body) });
        if (!d.ok) throw new Error(d.error || "Falhou");
        log(msg, "✓ " + d.message, "ok");
        setTimeout(refreshHome, 2000);
    } catch (e) {
        log(msg, "Erro: " + e.message, "err");
    }
}

async function loadMangas(q = "") {
    const list = document.getElementById("manga-list");
    list.innerHTML = "<p class='log'>Carregando…</p>";
    try {
        const d = await api("/mangas?q=" + encodeURIComponent(q));
        if (!d.ok) throw new Error(d.error);
        if (!d.mangas?.length) {
            list.innerHTML = "<p class='log'>Nenhum mangá encontrado.</p>";
            return;
        }
        list.innerHTML = d.mangas.slice(0, 100).map((m) => {
            const st = m.stats || {};
            const caps = st.capsLegivel || st.capsIndex || st.capsState || 0;
            const telegra = st.telegraOk ? "telegra ✓" : (caps > 0 ? "parcial" : "—");
            return `
          <div class="manga-item" data-slug="${esc(m.nexusSlug)}">
            <div class="info">
              <div class="title">${esc(m.title)}</div>
              <div class="slug">${esc(m.nexusSlug)} · ${caps} caps · ${telegra}</div>
            </div>
            <span class="badge ${m.enabled ? "on" : ""}">${m.enabled ? "ativo" : "off"}</span>
            <div class="manga-actions">
              <button class="btn btn-sm btn-secondary btn-sync-new" data-slug="${esc(m.nexusSlug)}" title="Só cap novo">🔄</button>
              <button class="btn btn-sm btn-primary btn-sync-all" data-slug="${esc(m.nexusSlug)}" title="Todos caps">↑</button>
            </div>
          </div>`;
        }).join("");

        list.querySelectorAll(".btn-sync-all").forEach((btn) => {
            btn.onclick = () => syncManga(btn.dataset.slug, true);
        });
        list.querySelectorAll(".btn-sync-new").forEach((btn) => {
            btn.onclick = () => syncManga(btn.dataset.slug, false);
        });
    } catch (e) {
        list.innerHTML = `<p class="log err">${esc(e.message)}</p>`;
    }
}

async function syncManga(slug, allChapters) {
    const msg = document.getElementById("manga-msg");
    log(msg, allChapters ? `Importando todos caps: ${slug}…` : `Sync cap novo: ${slug}…`);
    try {
        const body = { mode: "hyper", slug, deploy: true };
        if (allChapters) body.all_chapters = true;
        else body.sync_only_new = true;
        const d = await api("/trigger", { method: "POST", body: JSON.stringify(body) });
        if (!d.ok) throw new Error(d.error);
        log(msg, "✓ " + d.message, "ok");
    } catch (e) {
        log(msg, "Erro: " + e.message, "err");
    }
}

async function addManga(e) {
    e.preventDefault();
    const msg = document.getElementById("add-msg");
    const slug = document.getElementById("add-slug").value.trim();
    const title = document.getElementById("add-title").value.trim();
    const startImport = document.getElementById("add-import").checked;
    if (!slug) return log(msg, "Informe o slug NexusToons", "err");

    log(msg, "Adicionando mangá…");
    try {
        const d = await api("/add-manga", {
            method: "POST",
            body: JSON.stringify({ nexusSlug: slug, title, enabled: true, startImport })
        });
        if (!d.ok) throw new Error(d.error);
        log(msg, "✓ " + d.message, "ok");
        document.getElementById("add-form").reset();
        if (startImport) setTimeout(refreshHome, 1500);
    } catch (e) {
        log(msg, "Erro: " + e.message, "err");
    }
}

function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function initApp() {
    const pin = getPin();
    if (!pin) return;

    const ping = await api("/ping");
    if (!ping.ok) {
        document.getElementById("pin-screen").classList.remove("hidden");
        document.getElementById("app").classList.add("hidden");
        const pinMsg = document.getElementById("pin-msg");
        if (pinMsg) log(pinMsg, ping.error || "PIN inválido", "err");
        return;
    }

    document.getElementById("pin-screen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    document.querySelectorAll(".tab").forEach((t) => {
        t.onclick = () => {
            showPanel(t.dataset.panel);
            if (t.dataset.panel === "panel-mangas") loadMangas(document.getElementById("search-manga").value);
        };
    });

    document.getElementById("btn-hyper").onclick = () =>
        trigger({ mode: "hyper", deploy: true, all_chapters: true });
    document.getElementById("btn-ultra").onclick = () =>
        trigger({ mode: "ultra", deploy: true, all_chapters: true });
    document.getElementById("btn-sync-new").onclick = () =>
        trigger({ mode: "hyper", deploy: true, sync_only_new: true });
    document.getElementById("btn-refresh").onclick = refreshHome;
    document.getElementById("search-manga").oninput = (e) => loadMangas(e.target.value);
    document.getElementById("add-form").onsubmit = addManga;

    refreshHome();
    setInterval(refreshHome, 60000);

    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/mobile/sw.js").catch(() => {});
    }
}

document.getElementById("btn-pin-save").onclick = async () => {
    const p = document.getElementById("pin-input").value.trim();
    if (!p) return;
    sessionStorage.setItem(PIN_KEY, p);
    await initApp();
};

if (getPin()) initApp();
