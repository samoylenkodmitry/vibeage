import { expect, type Page } from '@playwright/test';
import { CI_AUTH_SECRET, mintCiSessionToken } from '../../scripts/ci-session-token.mjs';

type Offset = {
  x: number;
  z: number;
};

const DEFAULT_SMOKE_MOVE_OFFSET = { x: 12, z: -8 } satisfies Offset;

// Headless CI has no GPU, so Chromium renders WebGL through SwiftShader. The
// full graphics stack (shadows, bloom, god-rays, full-DPR instanced grass +
// foliage) overwhelms the software renderer and crashes the page on world
// mount — the game never finishes connecting, so every world-entering spec
// timed out. Pin the lowest graphics tier (the real user-facing setting in
// graphicsSettings.ts, key 'vibeage.graphics.v1') so the world renders cheaply
// and the renderer stays alive. These specs assert game logic via the state
// bridge, not pixels, so visual fidelity is irrelevant here.
const E2E_GRAPHICS_SETTINGS = JSON.stringify({
  tier: 'low',
  resolutionScale: 0.5,
  shadows: false,
  bloom: false,
  godRays: false,
  antialias: false,
  valeHD: false,
  fog: false,
  viewDistance: 0.6,
  foliageDensity: 0,
  grassDensity: 0,
});

// PR M: Lobby (PR I) gates the world behind login + character roster
// fetched from /api/account/characters. CI runs with persistence off,
// so the DB-backed auth endpoints would 500. We mint a valid session
// token locally, seed it into localStorage, and route-stub the roster
// endpoint to return the requested character. The world join then
// flows through transient-player creation (persistence disabled),
// which already accepts any account id the token signs over.
export async function enterWorld(page: Page, playerName: string): Promise<void> {
  const token = mintCiSessionToken({
    secret: CI_AUTH_SECRET,
    accountId: `e2e-${playerName}`,
  });
  await page.addInitScript(([t, login, graphics]) => {
    window.localStorage.setItem(
      'vibeage:session',
      JSON.stringify({ token: t, login }),
    );
    window.localStorage.setItem('vibeage.graphics.v1', graphics);
  }, [token, playerName, E2E_GRAPHICS_SETTINGS]);
  await page.route('**/api/account/characters', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{ name: playerName, race: 'human', class_name: 'mage' }],
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter World' }).click();
  await waitForConnectedGame(page);
}

export async function getClientState(page: Page) {
  return page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.getState() ?? null);
}

export async function movePlayerNear(page: Page, offset: Offset = DEFAULT_SMOKE_MOVE_OFFSET): Promise<Offset> {
  const initialPosition = await waitForPlayerPosition(page);

  const target = await page.evaluate((nextOffset) => {
    return window.__VIBEAGE_VITE_E2E__?.moveNearPlayer(nextOffset);
  }, offset);

  expect(target).toBeTruthy();
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__?.getState().targetWorldPos));
  await page.waitForFunction((previous) => {
    const current = window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition;
    if (!current || !previous) {
      return false;
    }

    return Math.abs(current.x - previous.x) + Math.abs(current.z - previous.z) > 0.01;
  }, initialPosition);

  return target!;
}

export async function expectSelectedTargetCleared(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__VIBEAGE_VITE_E2E__?.getState().selectedTargetId === null);
}

export async function selectFirstEnemy(page: Page): Promise<string> {
  const selectedEnemyId = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.selectFirstEnemy() ?? null);
  expect(selectedEnemyId).toBeTruthy();
  return selectedEnemyId!;
}

export async function castFireballFromSkillBar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cast Fireball' }).click();
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    return Boolean(state?.castSkillIds.includes('fireball') || state?.liveProjectileSkillIds.includes('fireball'));
  });
}

export async function ensurePlayerAlive(page: Page): Promise<void> {
  const isAlive = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.getState().playerVitals?.isAlive ?? false);
  if (isAlive) {
    return;
  }

  await page.getByRole('button', { name: 'Respawn' }).click();
  await page.waitForFunction(() => window.__VIBEAGE_VITE_E2E__?.getState().playerVitals?.isAlive === true);
}

async function waitForConnectedGame(page: Page): Promise<void> {
  // The 3D world is a lazy chunk (App.tsx code-splits WorldScene out of the
  // initial bundle), so the <canvas> mounts only after that chunk loads and
  // r3f initialises. Against the unbundled e2e dev server that first load can
  // exceed the default 10s expect timeout, so wait explicitly. App prefetches
  // the chunk from the lobby to keep this fast; the headroom is just insurance.
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    return state?.connectionState === 'online'
      && Boolean(state.myPlayerId)
      && Boolean(state.lastKnownPlayerPosition)
      && state.enemyIds.length > 0;
  }, undefined, { timeout: 25_000 });
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cast Fireball' })).toBeVisible();
}

async function waitForPlayerPosition(page: Page) {
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition));
  return page.evaluate(() => window.__VIBEAGE_VITE_E2E__!.getState().lastKnownPlayerPosition!);
}
