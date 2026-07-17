import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts", "bots/**/*.test.mjs"],
        environment: "node"
    }
});
