/**
 * Testes unitários — Catbox hosting + stream (sem rede).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const VALID_JPEG = Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0mICYtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIABQAFAMBIgACEQEDEQH/xAAcAAABBQEBAQAAAAAAAAAAAAAAAQIDBAUGBwj/xABAEAACAQIEAwUEBgYCAwAAAAAAAQIDEQQSITEFQVEGEyJhcYEUMkKRobHB0fAHFSNSYnKC4SNDkqLC8RUzQ1Oy/8QAGgEBAQEBAQEBAAAAAAAAAAAAAAECBAMFBv/EACQRAQEBAAICAgIDAQAAAAAAAAABAhEDIRIxBEETIlFhBRQj/9oADAMBAAIRAxEAPwD8wREQEREBERAREQEREBERAREQEREBERAREQf/Z",
    "base64"
);

vi.mock("../shared/stream-page-processor.mjs", () => ({
    STREAM_PAGE_CONCURRENCY: 1,
    downloadProcessPage: async () => ({
        buffer: VALID_JPEG,
        ext: "jpg",
        contentType: "image/jpeg",
        cleanup: () => {}
    })
}));

import { uploadChapterPages } from "./catbox.js";
import { validateImageBuffer } from "./telegra.js";
import { isLegiblePageUrl } from "../shared/schema.js";

describe("catbox validateImageBuffer", () => {
    it("aceita JPEG válido", () => {
        expect(validateImageBuffer(VALID_JPEG).ok).toBe(true);
    });
});

describe("uploadChapterPages catbox", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubEnv("CATBOX_STATIC_FALLBACK", "false");
    });

    it("preserva ordem e retorna URLs catbox", async () => {
        const axios = await import("axios");
        vi.spyOn(axios.default, "post").mockResolvedValue({
            status: 200,
            data: "https://files.catbox.moe/abc123.jpg"
        });

        const pages = [
            { index: 0, url: "https://cdn.example/a.jpg" },
            { index: 1, url: "https://cdn.example/b.jpg" }
        ];

        const result = await uploadChapterPages(pages, { referer: "https://nexustoons.com/" });

        expect(result.ok).toBe(true);
        expect(result.hostingMode).toBe("catbox");
        expect(result.pages).toHaveLength(2);
        expect(result.pages[0].url).toContain("catbox.moe");
        expect(result.pages.every((p) => isLegiblePageUrl(p.url))).toBe(true);
    });

    it("falha capítulo se upload catbox falhar", async () => {
        const axios = await import("axios");
        vi.spyOn(axios.default, "post").mockResolvedValueOnce({
            status: 200,
            data: "https://files.catbox.moe/ok.jpg"
        }).mockResolvedValueOnce({
            status: 400,
            data: "Error: invalid"
        });

        const pages = [
            { index: 0, url: "https://cdn.example/a.jpg" },
            { index: 1, url: "https://cdn.example/b.jpg" }
        ];

        const result = await uploadChapterPages(pages);

        expect(result.ok).toBe(false);
        expect(result.pages).toHaveLength(1);
        expect(result.failedPages).toEqual([1]);
    });
});

describe("hosting adapter default", () => {
    it("resolve catbox quando env não definido", async () => {
        vi.stubEnv("HOSTING_ADAPTER", "");
        vi.stubEnv("NEXUSTOONS_HOSTING_ADAPTER", "");
        vi.resetModules();
        const { getHostingAdapter } = await import("./adapter.js");
        const adapter = await getHostingAdapter();
        expect(adapter.name).toBe("catbox");
    });
});
