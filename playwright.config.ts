// Playwright configuration for the karet end-to-end smoke tests.
// These tests drive the dashboard and graph pages against a live Worker +
// RustFS stack from the top-level docker-compose.yaml.
//
// Prerequisite
// ------------
// Before running these tests, start the full stack from the repository
// root:
//
//     docker compose up -d
//
// Wait until the `web` service is responsive on http://localhost:3000,
// then run:
//
//     npm run test:e2e
//
// The config intentionally does *not* spawn its own web server, the
// E2E suite assumes docker-compose (or the user) already has `web`,
// `worker`, and `rustfs` running. This keeps the Playwright harness
// lightweight and avoids embedding Docker orchestration in the test
// runner.

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests-e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
