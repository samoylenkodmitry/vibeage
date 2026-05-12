import { defineConfig, devices } from "@playwright/test";

const clientUrl = "http://localhost:3000";
const clientLoopbackUrl = "http://127.0.0.1:3000";
const gameServerPort = 3101;
const gameServerUrl = `http://127.0.0.1:${gameServerPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: clientUrl,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: `PORT=${gameServerPort} VIBEAGE_DISABLE_PERSISTENCE=1 CORS_ORIGINS=${clientUrl},${clientLoopbackUrl} WS_COMPRESSION=0 pnpm run dev:server`,
      url: `${gameServerUrl}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: `NEXT_PUBLIC_GAME_SERVER_URL=${gameServerUrl} pnpm exec next dev`,
      url: clientUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
