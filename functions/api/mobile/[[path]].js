/**
 * API mobile — status + disparo GitHub Actions (hyper na nuvem).
 * Auth: header X-Mobile-Pin ou ?pin= (secret MOBILE_TRIGGER_PIN no Pages).
 */
import { corsHeaders } from "../../../scripts/cloud/cloud-api-core.mjs";
import { bindWorkerEnv } from "../../../scripts/cloud/worker-bind-env.mjs";

const REPO = "olavoprovisaosolar-byte/akira-scan";
const WORKFLOW_FILE = "migrate-bulk-hyper.yml";

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() }
    });
}

function authorize(request, env) {
    const expected = String(env.MOBILE_TRIGGER_PIN || "").trim();
    if (!expected) return { ok: false, reason: "MOBILE_TRIGGER_PIN não configurado no Pages." };
    const url = new URL(request.url);
    const pin = String(
        request.headers.get("X-Mobile-Pin")
        || url.searchParams.get("pin")
        || ""
    ).trim();
    if (pin !== expected) return { ok: false, reason: "PIN inválido." };
    return { ok: true };
}

async function githubDispatch(env, inputs) {
    const token = String(env.GITHUB_TOKEN || "").trim();
    if (!token) return { ok: false, error: "GITHUB_TOKEN ausente no Pages." };

    const res = await fetch(
        `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "akira-mobile-trigger"
            },
            body: JSON.stringify({ ref: "main", inputs })
        }
    );

    if (res.status === 204) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `GitHub ${res.status}: ${text.slice(0, 300)}` };
}

async function fetchCloudStatus(origin) {
    try {
        const res = await fetch(`${origin}/api/cloud/status`, {
            headers: { Accept: "application/json" }
        });
        if (!res.ok) return { ok: false, error: `status HTTP ${res.status}` };
        return { ok: true, data: await res.json() };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function fetchLatestRun(env) {
    const token = String(env.GITHUB_TOKEN || "").trim();
    if (!token) return null;
    try {
        const res = await fetch(
            `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=1`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            }
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
            createdAt: run.created_at
        };
    } catch {
        return null;
    }
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

    if (request.method === "GET" && (path.endsWith("/status") || path.endsWith("/mobile"))) {
        const cloud = await fetchCloudStatus(origin);
        const run = await fetchLatestRun(env);
        return json({
            ok: true,
            cloud: cloud.ok ? cloud.data : { error: cloud.error },
            workflow: run,
            repo: REPO
        });
    }

    if (request.method === "POST" && path.endsWith("/trigger")) {
        const auth = authorize(request, env);
        if (!auth.ok) return json({ ok: false, error: auth.reason }, 401);

        let body = {};
        try {
            body = await request.json();
        } catch { /* empty */ }

        const inputs = {
            mode: body.mode === "ultra" ? "ultra" : "hyper",
            deploy: body.deploy === false ? "false" : "true",
            slug: String(body.slug || "").trim(),
            sync_interval_minutes: String(body.sync_interval_minutes || "15"),
            manga_parallel: String(body.manga_parallel || "3")
        };

        const dispatched = await githubDispatch(env, inputs);
        if (!dispatched.ok) return json({ ok: false, error: dispatched.error }, 502);

        return json({
            ok: true,
            message: "Workflow hyper iniciado na nuvem (GitHub Actions).",
            inputs,
            actionsUrl: `https://github.com/${REPO}/actions/workflows/${WORKFLOW_FILE}`
        });
    }

    return json({ error: "Not found", routes: ["GET /api/mobile/status", "POST /api/mobile/trigger"] }, 404);
}
