#!/usr/bin/env node
/** Testa o matching de rotas /api/cloud (pages vs page). */
import assert from "node:assert/strict";

function routePath(pathname) {
    const p = pathname.replace(/\/$/, "") || "/";
    return {
        isPages: p.endsWith("/pages") || p.includes("/cloud/pages"),
        isPage: /(^|\/)page$/.test(p) || /\/cloud\/page$/.test(p)
    };
}

const pages = routePath("/api/cloud/pages");
assert.equal(pages.isPages, true);
assert.equal(pages.isPage, false, "/pages não pode ser tratado como /page");

const page = routePath("/api/cloud/page");
assert.equal(page.isPage, true);
assert.equal(page.isPages, false);

console.log("[test-cloud-routes] OK");
