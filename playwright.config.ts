import { defineConfig } from "@playwright/test";

const testPort = process.env.E2E_PORT ?? "3000";
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:" + testPort;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: baseUrl,
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -- --port " + testPort,
    url: baseUrl + "/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGINT", timeout: 5_000 },
    env: { ...process.env, NEXT_DIST_DIR: `work/e2e-next-${process.pid}` }
  }
});
