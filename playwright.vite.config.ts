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
  // Archwork item #1 follow-up — one CI retry on failure so a single
  // flaky timeout (Chromium cold-start, slow runner) doesn't block
  // the whole post-merge gate. Local runs (CI undefined) stay strict
  // so authors see real failures immediately.
  retries: process.env.CI ? 1 : 0,
  // `on-first-retry` would skip the trace for the initial fail; we
  // want both so the artifact upload captures whatever happens.
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
      command: `PORT=${gameServerPort} VIBEAGE_DISABLE_PERSISTENCE=1 VIBEAGE_ENABLE_DEV_COMMANDS=1 VIBEAGE_AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx CORS_ORIGINS=${clientUrl},${clientLocalhostUrl} WS_COMPRESSION=0 pnpm exec tsx apps/server/src/main.ts`,
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
