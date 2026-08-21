#!/usr/bin/env node
/** Testes unitários — page-url-rules + pickBetterCap + chapter-label */
import assert from "node:assert/strict";
import {
    hasHostedPages,
    pickBetterCap,
    capLegivelIndice,
    isServablePageUrl,
    isDurablePageUrl
} from "./lib/chapter-index-utils.mjs";
import { isRealChapterPageSet } from "../js/services/chapter-label.js";

assert.equal(isDurablePageUrl("https://iili.io/abc.jpg"), true);
assert.equal(isDurablePageUrl("https://litter.catbox.moe/x.webp"), false);
assert.equal(isServablePageUrl("https://akira-scan.pages.dev/api/gh-cdn/04/pages/a/b/001.jpg"), true);
assert.equal(isServablePageUrl("https://akira-scan.pages.dev/api/discord-img?ch=1&msg=2"), false);
assert.equal(isServablePageUrl("https://akira-scan.pages.dev/data/cloud/pages/a/b/001.jpg"), false);
assert.equal(isServablePageUrl("https://litter.catbox.moe/x.webp"), false);

assert.equal(hasHostedPages({ pages: [{ url: "https://iili.io/a.jpg" }] }), true);
assert.equal(capLegivelIndice({ done: true, pages: [{ url: "https://iili.io/a.jpg" }] }), true);
assert.equal(capLegivelIndice({ done: true, pages: [{ url: "https://akira-scan.pages.dev/api/discord-img?x=1" }] }), false);
assert.equal(capLegivelIndice({
    done: true,
    localPurged: true,
    pages: [{ url: "https://akira-scan.pages.dev/data/cloud/pages/a/b/001.jpg" }]
}), false);

const durable = {
    pages: [{ url: "https://iili.io/1.jpg" }],
    hostedAt: "2026-08-01T00:00:00.000Z"
};
const deadDiscord = {
    pages: Array.from({ length: 20 }, () => ({ url: "https://akira-scan.pages.dev/api/discord-img?ch=1&msg=2" })),
    hostedAt: "2026-08-20T00:00:00.000Z"
};
assert.equal(pickBetterCap(durable, deadDiscord), durable, "host durável vence mais páginas mortas");

const ghPages = [{ url: "https://akira-scan.pages.dev/api/gh-cdn/04/pages/obra/x/001.jpg" }];
const discordPages = [{ url: "https://akira-scan.pages.dev/api/discord-img?ch=1&msg=2&att=3" }];
assert.equal(isRealChapterPageSet(ghPages), true);
assert.equal(isRealChapterPageSet(discordPages), true, "estruturalmente válido (proxy existe)");
assert.equal(isRealChapterPageSet([{ url: "https://akira-scan.pages.dev/data/cloud/pages/a/b/001.jpg" }]), false);

console.log("[test-chapter-index-utils] OK");
