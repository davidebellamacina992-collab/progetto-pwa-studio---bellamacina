import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGINT", timeout: 5_000 },
    env: { ...process.env, NEXT_DIST_DIR: `work/e2e-next-${process.pid}` }
  }
});
