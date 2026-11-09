import { defineConfig, devices } from "@playwright/test";

// E2E-Tests laufen gegen lokales Supabase (npx supabase start) und die simulierte KI (AI_MOCK=1).
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    ...devices["iPhone 13"],
    browserName: "chromium",
    trace: "off",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3000",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        env: { AI_MOCK: "1" },
        timeout: 120_000,
      },
});
