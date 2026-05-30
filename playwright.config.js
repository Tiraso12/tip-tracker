import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    use: {
        baseURL: "http://127.0.0.1:5173",
        trace: "on-first-retry",
    },
    webServer: {
        command: "npm run dev:test",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
