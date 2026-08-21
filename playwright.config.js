import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT || process.env.PORT || "5173";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const webServerCommand = process.env.E2E_WEB_SERVER_COMMAND || "npm run dev:test";

export default defineConfig({
    testDir: "./tests/e2e",
    workers: 1,
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    use: {
        baseURL,
        trace: "on-first-retry",
    },
    webServer: {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === "false" ? false : true,
        timeout: 120_000,
    },
});
