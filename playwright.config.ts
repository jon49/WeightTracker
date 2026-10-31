import { defineConfig, devices } from "@playwright/test";
import { API_PORT, APP_PORT } from "./e2e/env.js";

// End-to-end tests: the real app (service worker and all) in Chromium against
// a throwaway TrailBase (e2e/backend.sh), as ../soccer's suite.
export default defineConfig({
  testDir: "./e2e",
  // One backend; keep the tests from racing each other's server checks.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "./e2e/backend.sh",
      url: `http://localhost:${API_PORT}/api/auth/v1/status`,
      env: { E2E_API_PORT: String(API_PORT) },
      // The first run may build the ImageBase guest wasm.
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command: `npx tsx ./node_modules/@jon49/sw/bin/start.ts --env=dev -p ${APP_PORT} --proxy=/api=http://localhost:${API_PORT}`,
      url: `http://localhost:${APP_PORT}/login/`,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
