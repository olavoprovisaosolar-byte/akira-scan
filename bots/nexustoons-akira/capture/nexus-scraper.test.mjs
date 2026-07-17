/**
 * Testes unitários — nexus-scraper facade (sem rede).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./nexustoons.js", () => ({
    createAdapter: vi.fn(() => ({
        getManga: vi.fn(async (slug) => ({
            id: "123",
            slug,
            title: "Test Manga",
            chapters: [
                { id: 1, number: 1, title: "Cap 1" },
                { id: 2, number: 2, title: "Cap 2" }
            ]
        })),
        captureChapter: vi.fn(async (_slug, ch) => ({
            mangaId: "obra-test1234",
            capId: `cap-test-${ch.number}`,
            numero: Number(ch.number),
            titulo: ch.title,
            pages: [
                { index: 0, url: "https://cdn.example/page1.webp" },
                { index: 1, url: "https://cdn.example/page2.webp" }
            ]
        })),
        close: vi.fn(async () => {})
    }))
}));

const { scrapeNexusToons } = await import("./nexus-scraper.mjs");

describe("scrapeNexusToons", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("retorna metadados e capítulos sem imagens em dryRun", async () => {
        const result = await scrapeNexusToons("test-slug", { dryRun: true, includeImages: false });

        expect(result.slug).toBe("test-slug");
        expect(result.nexusId).toBe("123");
        expect(result.title).toBe("Test Manga");
        expect(result.chapters).toHaveLength(2);
        expect(result.chapters[0]).toEqual({
            id: 1,
            number: 1,
            title: "Cap 1",
            imageUrls: []
        });
    });

    it("captura imageUrls quando includeImages=true", async () => {
        const result = await scrapeNexusToons("test-slug", { includeImages: true });

        expect(result.chapters[0].imageUrls).toHaveLength(2);
        expect(result.chapters[0].imageUrls[0]).toContain("cdn.example");
    });

    it("filtra capítulos por chapterNumbers", async () => {
        const result = await scrapeNexusToons("test-slug", {
            includeImages: false,
            dryRun: true,
            chapterNumbers: ["2"]
        });

        expect(result.chapters).toHaveLength(1);
        expect(result.chapters[0].number).toBe(2);
    });

    it("rejeita slug vazio", async () => {
        await expect(scrapeNexusToons("")).rejects.toThrow("slug obrigatório");
    });
});

describe("scrapeNexusToons — contrato de saída", () => {
    it("estrutura de saída contém campos obrigatórios", async () => {
        const result = await scrapeNexusToons("my-manga", { dryRun: true, includeImages: false });

        expect(result).toHaveProperty("slug");
        expect(result).toHaveProperty("nexusId");
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("chapters");
        expect(Array.isArray(result.chapters)).toBe(true);
        for (const ch of result.chapters) {
            expect(ch).toHaveProperty("id");
            expect(ch).toHaveProperty("number");
            expect(ch).toHaveProperty("title");
            expect(ch).toHaveProperty("imageUrls");
            expect(Array.isArray(ch.imageUrls)).toBe(true);
        }
    });
});
