import { defineConfig, devices } from "@playwright/test";

const domain = process.env.DOMAIN || "vibeage.eu";

export default defineConfig({
  testDir: "./tests/e2e-production",
  timeout: 45_000,
  expect: {
    timeout: 12_000
  },
  use: {
    baseURL: `https://${domain}`,
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
