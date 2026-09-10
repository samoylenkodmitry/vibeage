import { expect, test } from '@playwright/test';

/**
 * The regression this guards: a returning player whose saved session token had
 * died opened the game and was met by a full-screen login/create panel — a web
 * form in front of the world, exactly what the seamless start exists to
 * abolish. It is the most common way a *registered* player arrives (tokens age
 * out; sessions get revoked), so it has to be as seamless as a first visit.
 *
 * Expected behaviour: the dead token is dropped, the player lands in the
 * playable world as the Nameless guest, and the only trace is a dismissible
 * "return as <hero>" cue they may click when they feel like it.
 */
test('an expired saved session still lands in the world — no form, just a way back', async ({ page }) => {
  // A remembered hero whose token the server will reject (bad signature).
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'vibeage:session',
      JSON.stringify({
        token: 'dead.0.0.token',
        login: 'e2e-lapsed',
        character: { name: 'Aria', race: 'human', className: 'mage' },
      }),
    );
  });

  await page.goto('/');

  // The world comes up and is live, exactly as for a brand-new visitor.
  await expect(page.locator('#root canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online' && Boolean(s.myPlayerId);
  }, undefined, { timeout: 30_000 });

  // No identity panel opened itself — no login fields anywhere on the page.
  await expect(page.getByRole('dialog', { name: 'Heroes & account' })).toHaveCount(0);
  await expect(page.locator('#awaken-login')).toHaveCount(0);
  await expect(page.locator('#return-login')).toHaveCount(0);

  // The dead session is gone, so a refresh can't retry it forever.
  expect(await page.evaluate(() => window.localStorage.getItem('vibeage:session'))).toBeNull();

  // …and the way back is one click, offered rather than demanded.
  const reclaim = page.getByRole('button', { name: /return as/i });
  await expect(reclaim).toBeVisible();
  await reclaim.click();

  const panel = page.getByRole('dialog', { name: 'Heroes & account' });
  await expect(panel).toBeVisible();
  // Opened on "Return to a hero" — they came back for a hero they already have.
  await expect(panel.locator('#return-login')).toBeVisible();

  // Every control is genuinely operable, not merely present: real clicks hit-test
  // against whatever the HUD floats, so this catches the panel being buried under
  // another overlay (the first-run welcome card used to outrank it and swallow
  // these clicks). Typing into the field proves the same for the form itself.
  await panel.getByRole('tab', { name: /Become someone new/i }).click();
  await panel.getByRole('tab', { name: /Return to a hero/i }).click();
  await panel.locator('#return-login').click();
  await panel.locator('#return-login').fill('e2e-lapsed');
  await expect(panel.locator('#return-login')).toHaveValue('e2e-lapsed');

  // Dismissible from the keyboard — the world is still there, nothing answered.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});
