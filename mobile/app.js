const PIN_KEY = "akira_mobile_pin";
const BASELINE_KEY = "akira_telegra_baseline";
const API = "/api/mobile";
const REFRESH_IDLE_MS = 45000;
const REFRESH_ACTIVE_MS = 12000;

let refreshTimer = null;
let lastTelegra = null;

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
    if (!el) return;
    el.textContent = msg;
    el.className = "log " + cls;
}

function esc(s) {
    return String(s || "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtTime(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "—";
    }
}

function fmtWf(wf) {
    if (!wf) return "Nenhuma execução recente";
    const st = wf.status === "completed"
        ? (wf.conclusion === "success" ? "✓ concluído" : "✗ " + (wf.conclusion || "falhou"))
        : wf.status === "in_progress" ? "⏳ em andamento" : wf.status;
    const run = wf.runNumber ? `#${wf.runNumber} · ` : "";
    return `${run}${st} · ${new Date(wf.createdAt).toLocaleString("pt-BR")}`;
}

function setBar(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(100, Math.max(0, pct)) + "%";
}

function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.add("hidden"), 5000);
}

async function maybeNotifyTelegra(telegraCount) {
    if (telegraCount == null) return;
    const baseline = Number(sessionStorage.getItem(BASELINE_KEY) || lastTelegra || telegraCount);
    if (lastTelegra == null) {
        lastTelegra = telegraCount;
        sessionStorage.setItem(BASELINE_KEY, String(telegraCount));
        return;
    }
    if (telegraCount > lastTelegra) {
        const delta = telegraCount - lastTelegra;
        const msg = `+${delta} caps no Telegra! Total: ${telegraCount} legíveis no site.`;
        showToast(msg);
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("AkiraScan — upload", { body: msg, icon: "/img/akirascan-logo.png" });
        }
    }
    lastTelegra = telegraCount;
    sessionStorage.setItem(BASELINE_KEY, String(telegraCount));
}

function renderUpload(u) {
    const card = document.getElementById("upload-card");
    const active = !!u?.active;
    card?.classList.toggle("is-active", active);

    const title = document.getElementById("upload-title");
    const sub = document.getElementById("upload-sub");
    if (active) {
        title.textContent = "Upload em andamento na nuvem";
        sub.textContent = `${u.mangasWithCaps}/${u.mangasEnabled} mangás · ${u.capsState} caps processados`;
    } else if (u?.workflowConclusion === "success") {
        title.textContent = "Último job concluído";
        sub.textContent = `${u.capsTelegra} caps Telegra prontos para ler`;
    } else {
        title.textContent = u?.capsStaticBroken > 0
            ? "Aguardando re-upload Telegra"
            : "Upload pausado";
        sub.textContent = `${u?.capsLegivelSite ?? 0} legíveis · ${u?.capsStaticBroken ?? 0} aguardando Telegra`;
    }

    const pctM = u?.percentMangas ?? 0;
    const pctL = u?.percentLegivel ?? 0;
    document.getElementById("pct-mangas").textContent = pctM + "%";
    document.getElementById("pct-legivel").textContent = pctL + "%";
    setBar("bar-mangas", pctM);
    setBar("bar-legivel", pctL);

    document.getElementById("up-state").textContent = u?.capsState ?? "—";
    document.getElementById("up-telegra").textContent = u?.capsTelegra ?? "—";
    document.getElementById("up-broken").textContent = u?.capsStaticBroken ?? "—";

    const feed = document.getElementById("activity-feed");
    const recent = u?.recent || [];
    if (!recent.length) {
        feed.innerHTML = "<p class='log'>Nenhuma atividade recente no state.</p>";
        return;
    }
    feed.innerHTML = recent.map((r) => `
      <div class="activity-item">
        <span class="slug" title="${esc(r.slug)}">Cap ${esc(r.chapter)} · ${esc(r.slug.slice(0, 28))}${r.slug.length > 28 ? "…" : ""}</span>
        <span class="time">${fmtTime(r.at)}</span>
      </div>`).join("");
}

function scheduleRefresh(active) {
    if (refreshTimer) clearInterval(refreshTimer);
    const ms = active ? REFRESH_ACTIVE_MS : REFRESH_IDLE_MS;
    refreshTimer = setInterval(refreshHome, ms);
}

async function refreshHome() {
    const msg = document.getElementById("home-msg");
    try {
        const d = await api("/dashboard");
        if (!d.ok && d.error) throw new Error(d.error);

        const s = d.stats || {};
        const u = d.upload || {};

        document.getElementById("stat-caps").textContent = s.capsLegivelSite ?? s.capsTelegra ?? "—";
        document.getElementById("stat-mangas").textContent = d.mangas?.enabled ?? "—";
        document.getElementById("stat-pending").textContent = d.mangas?.pending ?? "—";
        document.getElementById("stat-state").textContent = s.capsState ?? "—";

        document.getElementById("wf-status").textContent = fmtWf(d.workflow);
        if (d.workflow?.url) document.getElementById("link-actions").href = d.workflow.url;

        renderUpload(u);
        await maybeNotifyTelegra(u.capsTelegra);
        scheduleRefresh(u.active);

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
        scheduleRefresh(true);
        setTimeout(refreshHome, 3000);
    } catch (e) {
        log(msg, "Erro: " + e.message, "err");
    }
}

function showPanel(id) {
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
    document.querySelector(`.tab[data-panel="${id}"]`)?.classList.add("active");
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
            const telegra = st.capsLegivel || 0;
            const state = st.capsState || 0;
            const tag = telegra > 0 ? `${telegra} telegra` : state > 0 ? `${state} proc.` : "—";
            return `
          <div class="manga-item" data-slug="${esc(m.nexusSlug)}">
            <div class="info">
              <div class="title">${esc(m.title)}</div>
              <div class="slug">${esc(m.nexusSlug)} · ${tag}</div>
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
        scheduleRefresh(true);
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

async function requestNotifyPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
}

async function initApp() {
    const pin = getPin();
    if (!pin) return;

    const ping = await api("/ping");
    if (!ping.ok) {
        document.getElementById("pin-screen").classList.remove("hidden");
        document.getElementById("app").classList.add("hidden");
        log(document.getElementById("pin-msg"), ping.error || "PIN inválido", "err");
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

    await requestNotifyPermission();
    refreshHome();

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
