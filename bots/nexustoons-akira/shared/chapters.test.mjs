/**
 * Testes unitários — ordenação de capítulos (sem rede).
 */
import { describe, it, expect } from "vitest";
import {
    compareChapterNumbers,
    sortChaptersAsc,
    sortChaptersDesc,
    selectChaptersForRun
} from "./chapters.js";

describe("compareChapterNumbers", () => {
    it("ordena inteiros e decimais corretamente", () => {
        expect(compareChapterNumbers(1, 2)).toBeLessThan(0);
        expect(compareChapterNumbers(15.5, 16)).toBeLessThan(0);
        expect(compareChapterNumbers(16, 15.5)).toBeGreaterThan(0);
        expect(compareChapterNumbers("10", "9")).toBeGreaterThan(0);
    });
});

describe("sortChaptersAsc", () => {
    it("ordena capítulos do 1 ao mais recente incluindo decimais", () => {
        const input = [
            { number: 3 },
            { number: "15.5" },
            { number: 1 },
            { number: 2 },
            { number: 16 }
        ];
        expect(sortChaptersAsc(input).map((c) => c.number)).toEqual([1, 2, 3, "15.5", 16]);
    });
});

describe("sortChaptersDesc", () => {
    it("ordena capítulos do mais recente ao mais antigo", () => {
        const input = [{ number: 1 }, { number: 3 }, { number: 2 }];
        expect(sortChaptersDesc(input).map((c) => c.number)).toEqual([3, 2, 1]);
    });
});

describe("selectChaptersForRun", () => {
    const chapters = [{ number: 1 }, { number: 2 }, { number: 3 }];

    it("modo padrão retorna só o capítulo mais recente", () => {
        expect(selectChaptersForRun(chapters).map((c) => c.number)).toEqual([3]);
    });

    it("--all-recent retorna todos em ordem decrescente", () => {
        expect(selectChaptersForRun(chapters, { allRecent: true }).map((c) => c.number)).toEqual([3, 2, 1]);
    });

    it("--all-chapters retorna todos em ordem crescente", () => {
        expect(selectChaptersForRun(chapters, { allChapters: true }).map((c) => c.number)).toEqual([1, 2, 3]);
    });

    it("modo padrão e latest-only são equivalentes", () => {
        const def = selectChaptersForRun(chapters);
        const explicit = selectChaptersForRun(chapters, { latestOnly: true });
        expect(def).toEqual(explicit);
        expect(def.map((c) => c.number)).toEqual([3]);
    });
});
