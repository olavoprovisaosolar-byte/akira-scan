#!/usr/bin/env node
/** Testes unitários rápidos para pickBetterCap / hasHostedPages */
import assert from "node:assert/strict";
import {
    hasHostedPages,
    pickBetterCap,
    capLegivelIndice
} from "./lib/chapter-index-utils.mjs";

assert.equal(hasHostedPages({ pages: [{ url: "https://iili.io/abc.jpg" }] }), true);
assert.equal(hasHostedPages({ pages: [{ url: "https://akira-scan.pages.dev/api/discord-img?x=1" }] }), true);
assert.equal(hasHostedPages({ pages: [{ url: "https://example.com/a.jpg" }] }), false);
assert.equal(capLegivelIndice({ done: true, pages: [{ url: "https://iili.io/a.jpg" }] }), true);
assert.equal(capLegivelIndice({ done: false, pages: [{ url: "https://iili.io/a.jpg" }] }), false);

const older = {
    pages: [{ url: "https://iili.io/1.jpg" }, { url: "https://iili.io/2.jpg" }],
    hostedAt: "2026-08-01T00:00:00.000Z"
};
const newer = {
    pages: [{ url: "https://iili.io/1.jpg" }, { url: "https://iili.io/2.jpg" }],
    hostedAt: "2026-08-20T00:00:00.000Z"
};
const morePages = {
    pages: [
        { url: "https://iili.io/1.jpg" },
        { url: "https://iili.io/2.jpg" },
        { url: "https://iili.io/3.jpg" }
    ],
    hostedAt: "2026-07-01T00:00:00.000Z"
};

assert.equal(pickBetterCap(older, newer), newer);
assert.equal(pickBetterCap(newer, older), newer);
assert.equal(pickBetterCap(newer, morePages), morePages);
assert.equal(pickBetterCap(older, { ...older }), older, "empate mantém local");
assert.equal(pickBetterCap(null, newer), newer);
assert.equal(pickBetterCap(newer, null), newer);

console.log("[test-chapter-index-utils] OK");
