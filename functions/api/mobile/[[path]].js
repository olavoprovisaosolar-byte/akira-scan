/**
 * API mobile — dashboard, mangás, trigger Actions, add manga via GitHub.
 */
import { corsHeaders, recomputePorManga, capLegivelRec } from "../../../scripts/cloud/cloud-api-core.mjs";
import { bindWorkerEnv } from "../../../scripts/cloud/worker-bind-env.mjs";

const REPO = "olavoprovisaosolar-byte/akira-scan";
const WORKFLOW_BULK = "migrate-bulk-hyper.yml";
const CONFIG_PATH = "bots/nexustoons-akira/config.mangas.json";
const INDEX_PATH = "data/cloud/chapters-index.json";
const STATE_PATH = "data/nexustoons/state.json";
const BRANCH = "main";

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() }
    });
}

function ghHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "akira-mobile-app"
    };
}

function authorize(request, env) {
    const expected = String(env.MOBILE_TRIGGER_PIN || "").trim();
    if (!expected) return { ok: false, reason: "MOBILE_TRIGGER_PIN não configurado." };
    const url = new URL(request.url);
    const pin = String(request.headers.get("X-Mobile-Pin") || url.searchParams.get("pin") || "").trim();
    if (pin !== expected) return { ok: false, reason: "PIN inválido." };
    return { ok: true };
}

function requireAuth(request, env) {
    const auth = authorize(request, env);
    if (!auth.ok) return auth;
    return null;
}

async function githubRaw(path, env) {
    const token = String(env.GITHUB_TOKEN || "").trim();
    const headers = token
        ? ghHeaders(token)
        : { Accept: "application/vnd.github.raw", "User-Agent": "akira-mobile-app" };
    const url = token
        ? `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`
        : `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    if (token) {
        const meta = await res.json();
        const raw = atob(meta.content.replace(/\n/g, ""));
        return { json: JSON.parse(raw), sha: meta.sha };
    }
    return { json: await res.json(), sha: null };
}

async function githubDispatch(env, workflowFile, inputs) {
    const token = String(env.GITHUB_TOKEN || "").trim();
    if (!token) return { ok: false, error: "GITHUB_TOKEN ausente." };
    const res = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`,
        {
            method: "POST",
            headers: ghHeaders(token),
            body: JSON.stringify({ ref: BRANCH, inputs })
        }
    );
    if (res.status === 204) return { ok: true };
    return { ok: false, error: `GitHub ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

async function fetchLatestRun(env, workflowFile = WORKFLOW_BULK) {
    const token = String(env.GITHUB_TOKEN || "").trim();
    if (!token) return null;
    try {
        const res = await fetch(
            `https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/runs?per_page=1`,
            { headers: ghHeaders(token) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const run = data.workflow_runs?.[0];
        if (!run) return null;
        return {
            id: run.id,
            status: run.status,
            conclusion: run.conclusion,
            url: run.html_url,
            createdAt: run.created_at,
            updatedAt: run.updated_at,
            event: run.event,
            runNumber: run.run_number
        };
    } catch {
        return null;
    }
}

async function fetchCloudStatus(origin) {
    try {
        const res = await fetch(`${origin}/api/cloud/status`, { headers: { Accept: "application/json" } });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        return { ok: true, data: await res.json() };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function loadMangaConfig(env) {
    const data = await githubRaw(CONFIG_PATH, env);
    return data?.json || { mangas: [], enabled: 0 };
}

function countProcessedBySlug(state) {
    const bySlug = {};
    for (const key of Object.keys(state?.processed || {})) {
        const slug = key.split("/")[0];
        if (!slug) continue;
        bySlug[slug] = (bySlug[slug] || 0) + 1;
    }
    return bySlug;
}

function countCapHosting(capsObj) {
    let telegra = 0;
    let catbox = 0;
    let staticBroken = 0;
    let legivelSite = 0;
    let done = 0;
    for (const rec of Object.values(capsObj || {})) {
        if (!rec?.done) continue;
        done++;
        const urls = (rec.pages || []).map((p) => String(p.url || ""));
        const hasTelegra = urls.some((u) => u.includes("telegra.ph"));
        const hasCatbox = urls.some((u) => u.includes("catbox.moe") || u.includes("files.catbox.moe"));
        if (hasTelegra) {
            telegra++;
            legivelSite++;
        } else if (hasCatbox) {
            catbox++;
            legivelSite++;
        } else if (rec.localPurged || urls.some((u) => u.includes("/data/cloud/pages/"))) {
            staticBroken++;
        }
    }
    return { telegra, catbox, staticBroken, legivelSite, done };
}

function recentProcessed(state, limit = 10) {
    return Object.entries(state?.processed || {})
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => new Date(b.processedAt || 0) - new Date(a.processedAt || 0))
        .slice(0, limit)
        .map((e) => ({
            slug: e.key.split("/")[0],
            chapter: e.chapterNumber || "?",
            at: e.processedAt,
            mangaId: e.akiraMangaId || null
        }));
}

function buildUploadProgress(cfg, indexData, stateData, workflow) {
    const enabled = (cfg.mangas || []).filter((m) => m.enabled !== false);
    const porManga = recomputePorManga(indexData?.caps || {});
    const hosting = countCapHosting(indexData?.caps || {});
    const stateTotal = Object.keys(stateData?.processed || {}).length;
    const mangasWithCaps = Object.values(porManga).filter((m) => m.doneCaps > 0).length;
    const enabledCount = enabled.length || 1;
    const active = workflow?.status === "in_progress" || workflow?.status === "queued";

    return {
        active,
        workflowStatus: workflow?.status || null,
        workflowConclusion: workflow?.conclusion || null,
        capsState: stateTotal,
        capsTelegra: hosting.telegra,
        capsCatbox: hosting.catbox,
        capsLegivelSite: hosting.legivelSite,
        capsStaticBroken: hosting.staticBroken,
        capsIndexDone: hosting.done,
        mangasEnabled: enabledCount,
        mangasWithCaps,
        percentMangas: Math.min(100, Math.round((mangasWithCaps / enabledCount) * 100)),
        percentLegivel: hosting.done
            ? Math.min(100, Math.round((hosting.legivelSite / hosting.done) * 100))
            : 0,
        recent: recentProcessed(stateData),
        stateUpdatedAt: stateData?.updatedAt || null,
        indexUpdatedAt: indexData?.atualizadoEm || null
    };
}

function buildMangaStats(cfg, indexData, stateData) {
    const porManga = recomputePorManga(indexData?.caps || {});
    const processedBySlug = countProcessedBySlug(stateData);
    const stats = {};

    for (const m of cfg.mangas || []) {
        const akiraId = m.akiraId || null;
        const idx = akiraId ? porManga[akiraId] : null;
        stats[m.nexusSlug] = {
            akiraId,
            capsIndex: idx?.doneCaps || 0,
            capsLegivel: idx?.legibleCaps || 0,
            capsTotal: idx?.totalCaps || 0,
            capsState: processedBySlug[m.nexusSlug] || 0,
            telegraOk: (idx?.legibleCaps || 0) > 0
        };
    }
    return stats;
}

async function githubUpdateConfig(env, newConfig, sha, message) {
    const token = String(env.GITHUB_TOKEN || "").trim();
    if (!token) return { ok: false, error: "GITHUB_TOKEN ausente para editar config." };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(newConfig, null, 2) + "\n")));
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${CONFIG_PATH}`, {
        method: "PUT",
        headers: ghHeaders(token),
        body: JSON.stringify({
            message,
            content,
            sha,
            branch: BRANCH
        })
    });
    if (!res.ok) return { ok: false, error: `GitHub PUT ${res.status}` };
    return { ok: true };
}

export async function onRequest(context) {
    const { request, env } = context;
    bindWorkerEnv(env);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");
    const origin = url.origin;

    // Ping / auth check
    if (request.method === "GET" && path.endsWith("/ping")) {
        const deny = requireAuth(request, env);
        if (deny) return json({ ok: false, error: deny.reason }, 401);
        return json({ ok: true, message: "PIN válido." });
    }

    // Dashboard
    if (request.method === "GET" && (path.endsWith("/dashboard") || path.endsWith("/status"))) {
        const cloud = await fetchCloudStatus(origin);
        const cfg = await loadMangaConfig(env);
        const enabled = (cfg.mangas || []).filter((m) => m.enabled !== false);
        const workflow = await fetchLatestRun(env);
        const indexRaw = await githubRaw(INDEX_PATH, env);
        const stateRaw = await githubRaw(STATE_PATH, env);
        const indexTotal = indexRaw?.json?.total || Object.keys(indexRaw?.json?.caps || {}).length || 0;
        const stateTotal = Object.keys(stateRaw?.json?.processed || {}).length;
        const porManga = recomputePorManga(indexRaw?.json?.caps || {});
        let legivelTotal = 0;
        for (const rec of Object.values(indexRaw?.json?.caps || {})) {
            if (capLegivelRec(rec)) legivelTotal++;
        }

        const upload = buildUploadProgress(cfg, indexRaw?.json, stateRaw?.json, workflow);

        return json({
            ok: true,
            cloud: cloud.ok ? cloud.data : { error: cloud.error },
            workflow,
            upload,
            stats: {
                capsIndex: indexTotal,
                capsState: stateTotal,
                capsLegivel: legivelTotal,
                capsLegivelSite: upload.capsLegivelSite,
                capsTelegra: upload.capsTelegra,
                mangasConfig: cfg.mangas?.length || 0,
                mangasEnabled: enabled.length,
                mangasNoIndex: Object.keys(porManga).length
            },
            mangas: {
                total: cfg.mangas?.length || 0,
                enabled: enabled.length,
                pending: Math.max(0, enabled.length - upload.mangasWithCaps)
            },
            repo: REPO,
            updatedAt: cfg.updatedAt || indexRaw?.json?.atualizadoEm || null
        });
    }

    // Lista mangás (auth)
    if (request.method === "GET" && path.endsWith("/mangas")) {
        const deny = requireAuth(request, env);
        if (deny) return json({ ok: false, error: deny.reason }, 401);
        const q = (url.searchParams.get("q") || "").toLowerCase().trim();
        const cfg = await loadMangaConfig(env);
        const indexRaw = await githubRaw(INDEX_PATH, env);
        const stateRaw = await githubRaw(STATE_PATH, env);
        const mangaStats = buildMangaStats(cfg, indexRaw?.json, stateRaw?.json);

        let list = (cfg.mangas || []).map((m) => ({
            ...m,
            stats: mangaStats[m.nexusSlug] || { capsIndex: 0, capsLegivel: 0, capsState: 0, telegraOk: false }
        }));

        if (q) {
            list = list.filter((m) =>
                (m.title || "").toLowerCase().includes(q)
                || (m.nexusSlug || "").toLowerCase().includes(q)
            );
        }

        list.sort((a, b) => (b.stats?.capsIndex || 0) - (a.stats?.capsIndex || 0));

        return json({ ok: true, mangas: list, total: list.length });
    }

    // Trigger migração
    if (request.method === "POST" && path.endsWith("/trigger")) {
        const deny = requireAuth(request, env);
        if (deny) return json({ ok: false, error: deny.reason }, 401);

        let body = {};
        try { body = await request.json(); } catch { /* empty */ }

        const inputs = {
            mode: body.mode === "ultra" ? "ultra" : "hyper",
            deploy: body.deploy === false ? "false" : "true",
            slug: String(body.slug || "").trim(),
            sync_interval_minutes: String(body.sync_interval_minutes || "15"),
            manga_parallel: String(body.manga_parallel || "3"),
            all_chapters: body.all_chapters ? "true" : "false",
            sync_only_new: body.sync_only_new ? "true" : "false"
        };

        const dispatched = await githubDispatch(env, WORKFLOW_BULK, inputs);
        if (!dispatched.ok) return json({ ok: false, error: dispatched.error }, 502);

        let msg = "Migração bulk iniciada na nuvem.";
        if (inputs.slug) {
            msg = inputs.sync_only_new === "true"
                ? `Sync caps novos: ${inputs.slug}`
                : inputs.all_chapters === "true"
                    ? `Importação completa: ${inputs.slug}`
                    : `Importação iniciada: ${inputs.slug}`;
        } else if (inputs.sync_only_new === "true") {
            msg = "Sync de caps novos (todos mangás) iniciado.";
        }

        return json({
            ok: true,
            message: msg,
            inputs,
            actionsUrl: `https://github.com/${REPO}/actions/workflows/${WORKFLOW_BULK}`
        });
    }

    // Adicionar mangá ao config
    if (request.method === "POST" && path.endsWith("/add-manga")) {
        const deny = requireAuth(request, env);
        if (deny) return json({ ok: false, error: deny.reason }, 401);

        let body = {};
        try { body = await request.json(); } catch { /* empty */ }

        const nexusSlug = String(body.nexusSlug || "").trim().toLowerCase();
        if (!nexusSlug) return json({ ok: false, error: "nexusSlug obrigatório." }, 400);

        const raw = await githubRaw(CONFIG_PATH, env);
        if (!raw?.json) return json({ ok: false, error: "Não foi possível ler config.mangas.json." }, 502);

        const cfg = raw.json;
        cfg.mangas = cfg.mangas || [];
        const exists = cfg.mangas.find((m) => m.nexusSlug === nexusSlug);
        if (exists) {
            exists.enabled = body.enabled !== false;
            if (body.title) exists.title = body.title;
        } else {
            cfg.mangas.push({
                nexusSlug,
                akiraId: body.akiraId || null,
                title: body.title || nexusSlug.replace(/-/g, " "),
                enabled: body.enabled !== false
            });
            cfg.totalAkira = (cfg.totalAkira || 0) + 1;
            cfg.matched = (cfg.matched || 0) + 1;
            cfg.enabled = cfg.mangas.filter((m) => m.enabled !== false).length;
        }
        cfg.updatedAt = new Date().toISOString();

        if (raw.sha) {
            const upd = await githubUpdateConfig(
                env,
                cfg,
                raw.sha,
                `bot(mobile): add manga ${nexusSlug}`
            );
            if (!upd.ok) return json({ ok: false, error: upd.error }, 502);
        }

        let importMsg = "";
        if (body.startImport) {
            const disp = await githubDispatch(env, WORKFLOW_BULK, {
                mode: "hyper",
                deploy: "true",
                slug: nexusSlug,
                sync_interval_minutes: "15",
                manga_parallel: "2",
                all_chapters: "true",
                sync_only_new: "false"
            });
            importMsg = disp.ok ? " Importação iniciada." : " (import falhou: " + disp.error + ")";
        }

        return json({
            ok: true,
            message: `Mangá ${nexusSlug} adicionado.${importMsg}`,
            nexusSlug
        });
    }

    // Toggle enabled
    if (request.method === "POST" && path.endsWith("/toggle-manga")) {
        const deny = requireAuth(request, env);
        if (deny) return json({ ok: false, error: deny.reason }, 401);

        let body = {};
        try { body = await request.json(); } catch { /* empty */ }

        const nexusSlug = String(body.nexusSlug || "").trim().toLowerCase();
        if (!nexusSlug) return json({ ok: false, error: "nexusSlug obrigatório." }, 400);

        const raw = await githubRaw(CONFIG_PATH, env);
        if (!raw?.json || !raw.sha) {
            return json({ ok: false, error: "Não foi possível ler config." }, 502);
        }

        const cfg = raw.json;
        const manga = (cfg.mangas || []).find((m) => m.nexusSlug === nexusSlug);
        if (!manga) return json({ ok: false, error: "Mangá não encontrado." }, 404);

        manga.enabled = body.enabled !== undefined ? !!body.enabled : !manga.enabled;
        cfg.enabled = cfg.mangas.filter((m) => m.enabled !== false).length;
        cfg.updatedAt = new Date().toISOString();

        const upd = await githubUpdateConfig(env, cfg, raw.sha, `bot(mobile): toggle ${nexusSlug}`);
        if (!upd.ok) return json({ ok: false, error: upd.error }, 502);

        return json({ ok: true, nexusSlug, enabled: manga.enabled });
    }

    return json({
        error: "Not found",
        routes: [
            "GET /api/mobile/ping",
            "GET /api/mobile/dashboard",
            "GET /api/mobile/mangas",
            "POST /api/mobile/trigger",
            "POST /api/mobile/add-manga",
            "POST /api/mobile/toggle-manga"
        ]
    }, 404);
}
