import { defineConfig, devices } from "@playwright/test";

const clientPort = 5174;
const gameServerPort = 3102;
const clientUrl = `http://127.0.0.1:${clientPort}`;
const clientLocalhostUrl = `http://localhost:${clientPort}`;
const gameServerUrl = `http://127.0.0.1:${gameServerPort}`;

export default defineConfig({
  testDir: "./tests/e2e-vite",
  timeout: 75_000,
  workers: process.env.CI ? 1 : undefined,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: clientUrl,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      // PR M: world join needs an HMAC-signed session token since PR I.
      // CI_AUTH_SECRET (40-byte 'x's) is mirrored in
      // scripts/ci-session-token.mjs and used by the e2e helper to mint
      // matching tokens; server falls through to transient (no-DB) joins.
      command: `PORT=${gameServerPort} VIBEAGE_DISABLE_PERSISTENCE=1 VIBEAGE_AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx CORS_ORIGINS=${clientUrl},${clientLocalhostUrl} WS_COMPRESSION=0 pnpm exec tsx apps/server/src/main.ts`,
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
