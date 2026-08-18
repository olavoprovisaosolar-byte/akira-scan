import { describe, it, expect } from "vitest";
import { spawnWithWatchdog } from "./supervised-spawn.mjs";

describe("spawnWithWatchdog", () => {
    it("mata processo silencioso após stallMs", async () => {
        const started = Date.now();
        const result = await spawnWithWatchdog(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
            stallMs: 800,
            label: "stall-test"
        });
        expect(result.stalled).toBe(true);
        expect(Date.now() - started).toBeLessThan(8000);
    }, 15_000);
});
