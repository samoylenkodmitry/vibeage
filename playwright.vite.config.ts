import { defineConfig, devices } from "@playwright/test";

const clientPort = 5174;
const gameServerPort = 3102;
const clientUrl = `http://127.0.0.1:${clientPort}`;
const clientLocalhostUrl = `http://localhost:${clientPort}`;
const gameServerUrl = `http://127.0.0.1:${gameServerPort}`;

export default defineConfig({
  testDir: "./tests/e2e-vite",
  timeout: 35_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: clientUrl,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: `PORT=${gameServerPort} VIBEAGE_DISABLE_PERSISTENCE=1 CORS_ORIGINS=${clientUrl},${clientLocalhostUrl} WS_COMPRESSION=0 pnpm exec tsx server/server.ts`,
      url: `${gameServerUrl}/healthz`,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000
    },
    {
      command: `GAME_SERVER_PROXY_TARGET=${gameServerUrl} pnpm exec vite --config apps/client/vite.config.ts --host 127.0.0.1 --port ${clientPort} --strictPort`,
      url: clientUrl,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
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
