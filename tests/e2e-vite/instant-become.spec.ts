import { expect, test } from '@playwright/test';
import { CI_AUTH_SECRET, mintCiSessionToken } from '../../scripts/ci-session-token.mjs';

/**
 * Phase 2 of the seamless start: a Nameless guest "Becomes" a real hero
 * entirely inside the 3D world — pick race → prophecy(class) → name, set a
 * login — and continues playing as that hero. No web screen, ever.
 *
 * The e2e server runs persistence-off, so the DB-backed accounts API can't
 * truly resolve. We stand in for it the same way the lobby helper does: stub
 * /api/auth to mint a CI-signed token (the server's VIBEAGE_AUTH_SECRET matches
 * CI_AUTH_SECRET) and accept the character create. The world join then flows
 * through transient-player creation, which applies the chosen race/class/name —
 * so the assertion that the guest became the picked identity is real.
 */
test('a Nameless guest Becomes a chosen hero — all in-world, no login wall', async ({ page }) => {
  const token = mintCiSessionToken({ secret: CI_AUTH_SECRET, accountId: 'e2e-become' });

  await page.route('**/api/auth', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token, login: 'e2e-arin', created: true }),
    });
  });
  await page.route('**/api/account/characters', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ characters: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto('/');

  // Lands straight in the playable world as the Nameless guest.
  await expect(page.locator('#root canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online' && Boolean(s.myPlayerId) && s.playerName === 'Nameless';
  }, undefined, { timeout: 25_000 });

  // Open the in-world Awakening flow from the floating prompt — never a form.
  const cta = page.getByRole('button', { name: /Awaken to claim your fate/ });
  await expect(cta).toBeVisible();
  await cta.click();

  // Pick a race, a prophecy that race allows, and a name; set a login.
  await page.locator('label.character-option--race:has(input[value="elf"])').click();
  await page.locator('label.character-option:has(input[name="className"][value="ranger"])').click();
  await page.locator('#awaken-name').fill('Arinthel');
  await page.locator('#awaken-login').fill('e2e-arin');
  await page.locator('#awaken-password').fill('passw0rd');
  await page.getByRole('button', { name: 'Awaken', exact: true }).click();

  // Reconnects seamlessly as the chosen hero — online as an elf ranger named
  // Arinthel, and the guest prompt is gone for good.
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online'
      && s.playerName === 'Arinthel'
      && s.playerRace === 'elf'
      && s.playerClass === 'ranger';
  }, undefined, { timeout: 25_000 });
  await expect(page.getByRole('button', { name: /Awaken to claim your fate/ })).toHaveCount(0);
});
