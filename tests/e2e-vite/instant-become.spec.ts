import { expect, test } from '@playwright/test';
import { CI_AUTH_SECRET, mintCiSessionToken } from '../../scripts/ci-session-token.mjs';

/**
 * The seamless start: a Nameless guest "Becomes" a real hero entirely inside
 * the 3D world — pick race → prophecy(class) → name, set a login — and keeps
 * playing as that hero IN PLACE, carrying its progress forward. No web screen,
 * no reconnect.
 *
 * The e2e server runs persistence-off, so the DB-backed accounts API can't
 * truly resolve. We stub /api/auth to mint a CI-signed token (the server's
 * VIBEAGE_AUTH_SECRET matches CI_AUTH_SECRET) — the in-world BecomeCharacter
 * command verifies it and promotes the live guest in place (the DB insert is
 * skipped under persistence-off, but the identity is applied), so the assertion
 * that the SAME player became the picked identity is real.
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
  // Remember the guest's player id — Become must keep it (in place), not mint a
  // fresh one (which a reconnect would).
  const guestId = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.getState().myPlayerId ?? null);
  expect(guestId).toBeTruthy();

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

  // Becomes the chosen hero IN PLACE — the SAME player id, now an elf ranger
  // named Arinthel — and the guest prompt is gone for good.
  await page.waitForFunction((gid) => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online'
      && s.myPlayerId === gid
      && s.playerName === 'Arinthel'
      && s.playerRace === 'elf'
      && s.playerClass === 'ranger';
  }, guestId, { timeout: 25_000 });
  await expect(page.getByRole('button', { name: /Awaken to claim your fate/ })).toHaveCount(0);

  // A returning visit drops straight back into the chosen hero — no web form,
  // no lobby, no Awaken prompt. The hero was remembered in the session.
  await page.reload();
  await expect(page.locator('#root canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online'
      && s.playerName === 'Arinthel'
      && s.playerRace === 'elf'
      && s.playerClass === 'ranger';
  }, undefined, { timeout: 25_000 });
  await expect(page.getByRole('button', { name: 'Enter World' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Awaken to claim your fate/ })).toHaveCount(0);
});
