/**
 * Testes unitários — normalização e validação de schema.
 */
import { describe, it, expect } from "vitest";
import { toCanonical, fromCanonical } from "../src/shared/schema.js";
import { validateMangaCanonical } from "../src/infrastructure/validation/manga-validator.js";

describe("schema normalization", () => {
    it("preserva id ao converter legacy → canonical → legacy", () => {
        const legacy = {
            id: "naruto",
            titulo: "Naruto",
            capa: "/api/catalogo/img?url=x",
            capitulos: [{ id: "cap-1", numero: 1, titulo: "Cap 1", paginas: 10 }],
            origem: "mangalivre"
        };
        const canonical = toCanonical(legacy, "mangalivre");
        expect(canonical.id).toBe("naruto");
        expect(canonical.title).toBe("Naruto");
        expect(canonical.chapters).toHaveLength(1);
        expect(canonical.chapters[0].id).toBe("cap-1");

        const back = fromCanonical(canonical);
        expect(back.id).toBe("naruto");
        expect(back.titulo).toBe("Naruto");
    });

    it("rejeita id corrompido na validação", () => {
        const bad = {
            id: "wrong",
            title: "X",
            coverUrl: "",
            chapters: [{ id: "c1", url: "", pages: [] }]
        };
        const result = validateMangaCanonical(bad, "naruto");
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("id inconsistente"))).toBe(true);
    });

    it("rejeita chapters vazio", () => {
        const empty = {
            id: "test",
            title: "Test",
            coverUrl: "",
            chapters: []
        };
        const result = validateMangaCanonical(empty);
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes("vazio"))).toBe(true);
    });
});
