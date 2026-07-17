/**
 * Testes unitários — Telegra sequencial + validação de imagem (sem rede).
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
    }),
    purgeTempFiles: () => {}
}));

vi.mock("../shared/image-hygiene.js", () => ({
    validateAndPrepareImage: async (buffer, ext = "jpg") => ({
        buffer,
        ext,
        contentType: ext === "png" ? "image/png" : "image/jpeg"
    }),
    basicMagicCheck: () => ({ ok: true })
}));

import {
    validateChapter,
    validateHostedChapter,
    normalizeHostedChapter,
    isTelegraUrl,
    chapterHasTelegraPages
} from "../shared/schema.js";
import { validateImageBuffer, uploadChapterPages } from "./telegra.js";
import { fromStructuredPayload, toStructuredPayload } from "../upload/akira-scan-api.js";

describe("validateImageBuffer", () => {
    it("rejeita buffer vazio ou muito pequeno", () => {
        expect(validateImageBuffer(Buffer.alloc(10)).ok).toBe(false);
        expect(validateImageBuffer(Buffer.alloc(0)).ok).toBe(false);
    });

    it("aceita JPEG válido", () => {
        expect(validateImageBuffer(VALID_JPEG).ok).toBe(true);
    });

    it("aceita PNG válido", () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array(200).fill(0)]);
        expect(validateImageBuffer(png).ok).toBe(true);
    });

    it("rejeita magic bytes inválidos", () => {
        const bad = Buffer.from([0x00, 0x01, 0x02, 0x03, ...Array(200).fill(0)]);
        expect(validateImageBuffer(bad).ok).toBe(false);
    });
});

describe("uploadChapterPages sequencial", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("preserva ordem 0, 1, 2 e falha capítulo se página intermediária falhar", async () => {
        const axios = await import("axios");
        const postSpy = vi.spyOn(axios.default, "post").mockImplementation(async (_url, form) => {
            const file = form?._streams?.find((s) => typeof s === "string" && s.includes("filename=\"002.jpg\""));
            if (file) throw new Error("upload falhou na página 2");
            return { status: 200, data: [{ src: "/file/test.jpg" }] };
        });

        const pages = [
            { index: 0, url: "https://cdn.example/ok.jpg" },
            { index: 1, url: "https://cdn.example/corrupt.jpg" },
            { index: 2, url: "https://cdn.example/ok2.jpg" }
        ];

        const result = await uploadChapterPages(pages, { referer: "https://nexustoons.com/" });

        expect(result.ok).toBe(false);
        expect(result.pages).toHaveLength(1);
        expect(result.pages[0].index).toBe(0);
        expect(result.failedPages).toEqual([1]);
        expect(postSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

        postSpy.mockRestore();
    });

    it("com TELEGRA_SKIP pula upload Telegra e usa cloud-static", async () => {
        vi.stubEnv("TELEGRA_SKIP", "1");
        vi.resetModules();
        const { uploadChapterPages: uploadSkip } = await import("./telegra.js");
        const axios = await import("axios");
        const postSpy = vi.spyOn(axios.default, "post");

        const pages = [
            { index: 0, url: "https://cdn.example/a.jpg" },
            { index: 1, url: "https://cdn.example/b.jpg" }
        ];

        const result = await uploadSkip(pages, {
            mangaId: "obra-test1234",
            capId: "cap-test1234-01"
        });

        expect(result.ok).toBe(true);
        expect(result.pages).toHaveLength(2);
        expect(result.hostingMode).toBe("cloud-static");
        expect(postSpy).not.toHaveBeenCalled();

        postSpy.mockRestore();
        vi.unstubAllEnvs();
    });

    it("completa capítulo quando todas as páginas são válidas", async () => {
        const axios = await import("axios");

        let uploadOrder = 0;
        const postSpy = vi.spyOn(axios.default, "post").mockImplementation(async () => {
            uploadOrder++;
            return {
                status: 200,
                data: [{ src: `/file/page${uploadOrder}.jpg` }]
            };
        });

        const pages = [
            { index: 0, url: "https://cdn.example/a.jpg" },
            { index: 1, url: "https://cdn.example/b.jpg" },
            { index: 2, url: "https://cdn.example/c.jpg" }
        ];

        const result = await uploadChapterPages(pages);

        expect(result.ok).toBe(true);
        expect(result.pages).toHaveLength(3);
        expect(result.pages.map((p) => p.index)).toEqual([0, 1, 2]);
        expect(postSpy).toHaveBeenCalledTimes(3);

        postSpy.mockRestore();
    });
});

describe("schema hosted chapter", () => {
    it("validateHostedChapter exige origem", () => {
        const ch = {
            mangaId: "obra-abc",
            capId: "cap-xyz-01",
            numero: 1,
            titulo: "Cap 1",
            pages: [{ index: 0, url: "https://telegra.ph/file/test.jpg" }]
        };
        expect(validateHostedChapter(ch).length).toBeGreaterThan(0);

        ch.pages[0].origem = "telegra";
        expect(validateHostedChapter(ch)).toEqual([]);
    });

    it("normalizeHostedChapter preenche origem telegra", () => {
        const hosted = normalizeHostedChapter({
            mangaId: "obra-abc",
            capId: "cap-xyz-01",
            numero: 1,
            pages: [{ index: 0, url: "https://telegra.ph/file/x.jpg", origem: "telegra" }]
        });
        expect(hosted.hosting).toBe("telegra");
        expect(hosted.pages[0].origem).toBe("telegra");
    });

    it("isTelegraUrl detecta domínio", () => {
        expect(isTelegraUrl("https://telegra.ph/file/abc.jpg")).toBe(true);
        expect(isTelegraUrl("https://cdn.example/x.webp")).toBe(false);
    });

    it("chapterHasTelegraPages", () => {
        expect(chapterHasTelegraPages({
            pages: [{ url: "https://telegra.ph/file/a.jpg", origem: "telegra" }]
        })).toBe(true);
        expect(chapterHasTelegraPages({
            pages: [{ url: "https://cdn.example/x.webp" }]
        })).toBe(false);
    });
});

describe("akira-scan structured payload", () => {
    it("fromStructuredPayload mapeia formato exato", () => {
        const ch = fromStructuredPayload({
            manga_title: "Test Manga",
            chapter_number: "15.5",
            chapter_title: "Cap especial",
            source_url: "https://nexustoons.com/manga/test/15.5",
            pages: ["https://telegra.ph/file/a.jpg", "https://telegra.ph/file/b.jpg"]
        }, { nexusSlug: "test", akiraId: "obra-test1234" });

        expect(ch.mangaTitle).toBe("Test Manga");
        expect(ch.numero).toBe(15.5);
        expect(ch.titulo).toBe("Cap especial");
        expect(ch.pages).toHaveLength(2);
        expect(ch.pages[0].origem).toBe("telegra");
    });

    it("toStructuredPayload gera formato de upload", () => {
        const payload = toStructuredPayload({
            mangaId: "obra-abc",
            capId: "cap-xyz-01",
            numero: 3,
            titulo: "Cap 3",
            pages: [
                { index: 0, url: "https://telegra.ph/file/1.jpg", origem: "telegra" },
                { index: 1, url: "https://telegra.ph/file/2.jpg", origem: "telegra" }
            ]
        }, { title: "Manga X", sourceUrl: "https://nexustoons.com/manga/x/3" });

        expect(payload).toEqual({
            manga_title: "Manga X",
            chapter_number: "3",
            chapter_title: "Cap 3",
            source_url: "https://nexustoons.com/manga/x/3",
            pages: ["https://telegra.ph/file/1.jpg", "https://telegra.ph/file/2.jpg"]
        });
    });
});

describe("validateChapter captured", () => {
    it("aceita chapter capturado válido", () => {
        const errors = validateChapter({
            mangaId: "obra-1",
            capId: "cap-1",
            numero: 5,
            pages: [{ index: 0, url: "https://cdn.example/1.webp" }]
        });
        expect(errors).toEqual([]);
    });
});
