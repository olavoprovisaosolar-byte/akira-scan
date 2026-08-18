import { describe, it, expect } from "vitest";
import { isCloudflareBlocked, isCloudflareError } from "./cloudflare.js";

describe("isCloudflareBlocked", () => {
    it("detecta HTML de challenge 403", () => {
        expect(isCloudflareBlocked(403, "<!DOCTYPE html>\nJust a moment")).toBe(true);
    });

    it("detecta 403 HTML genérico de WAF", () => {
        expect(isCloudflareBlocked(403, "<!DOCTYPE html><!--[if lt IE 7]>")).toBe(true);
    });

    it("não trata JSON de API com campo error como Cloudflare", () => {
        expect(isCloudflareBlocked(403, { error: "VIP_ONLY" })).toBe(false);
    });

    it("trata 429 sem corpo como bloqueio", () => {
        expect(isCloudflareBlocked(429, "")).toBe(true);
    });

    it("ignora 404 normal", () => {
        expect(isCloudflareBlocked(404, "not found")).toBe(false);
    });
});

describe("isCloudflareError", () => {
    it("reconhece mensagem de apiGet 403", () => {
        expect(isCloudflareError(new Error("NexusToons /api/mangas → HTTP 403: \"<!DOCTYPE"))).toBe(true);
    });
});
