import { expect, type Page } from '@playwright/test';

type Offset = {
  x: number;
  z: number;
};

const DEFAULT_SMOKE_MOVE_OFFSET = { x: 12, z: -8 } satisfies Offset;

export async function enterWorld(page: Page, playerName: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Character Name').fill(playerName);
  await page.getByRole('button', { name: 'Enter the World' }).click();
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
  await expect(page.locator('canvas')).toBeVisible();
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
