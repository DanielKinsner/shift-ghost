import { defineConfig, devices } from "@playwright/test";

// Point E2E_BASE_URL at an already-running dev server to reuse it.
const external = process.env.E2E_BASE_URL;
const port = 3210;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: external
    ? undefined
    : { command: `npm run dev -- --port ${port}`, url: `http://localhost:${port}`, reuseExistingServer: true, timeout: 240_000 },
});
