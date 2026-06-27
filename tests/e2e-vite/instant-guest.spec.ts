import { expect, test } from '@playwright/test';

/**
 * Phase 1 of the seamless start: a brand-new visitor — no session token, no
 * roster — lands straight in the playable world as a Nameless guest. No lobby,
 * no login wall. The client auto-connects sessionless on mount; the server
 * spawns a transient guest for the tokenless join.
 */
test('a brand-new visitor enters the world instantly as a guest — no login wall', async ({ page }) => {
  // Fresh visitor: nothing seeded into localStorage, no /api/account stub.
  await page.goto('/');

  // The world canvas mounts and the game reaches a live, playable state…
  await expect(page.locator('#root canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online'
      && Boolean(s.myPlayerId)
      && Boolean(s.lastKnownPlayerPosition)
      && s.enemyIds.length > 0;
  }, undefined, { timeout: 25_000 });

  // …without ever showing the login form.
  await expect(page.getByRole('button', { name: 'Enter World' })).toHaveCount(0);
});
