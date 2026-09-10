// Shared world entry for the local Playwright-driven tooling (world-screenshot,
// world-tour). The game has no login screen: every page load drops straight
// into the playable world, as a remembered hero or as the Nameless guest. To
// drive a *specific* account these scripts do what a player does — enter first,
// then use the in-world identity panel to Return to a hero.
//
// Passing no login leaves the script playing as the guest, which is all most
// world-art shots need.

/**
 * Click something in a world that is busy repainting. These scripts render the
 * scene on the CPU (SwiftShader), where Playwright's "element is stable" check
 * routinely times out on a control that is perfectly clickable — so fall back
 * to a forced click rather than failing the run. Fine here: this is screenshot
 * tooling, not a test asserting the UI is reachable.
 */
async function clickThrough(locator, timeout = 15_000) {
  await locator.waitFor({ state: 'attached', timeout });
  try {
    await locator.click({ timeout: 8_000 });
  } catch {
    await locator.click({ force: true, timeout: 8_000 });
  }
}

export async function waitOnline(page, timeout = 45_000) {
  await page.locator('canvas').waitFor({ state: 'visible', timeout });
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online' && Boolean(s.myPlayerId);
  }, undefined, { timeout });
}

/**
 * Land in the world and, when credentials are given, become the named hero via
 * the in-world identity panel (the ✦ Awaken / ⚜ Heroes button → "Return to a
 * hero" → roster → Enter). `character` picks a specific hero when the account
 * has several; omitted, the first in the roster is used.
 */
export async function enterWorld(page, { login, password, character } = {}) {
  await waitOnline(page);
  if (!login || !password) return 'guest';

  await clickThrough(page.locator('.awaken-cta, .account-button').first(), 30_000);
  const panel = page.getByRole('dialog', { name: 'Heroes & account' });
  await panel.waitFor({ state: 'visible', timeout: 15_000 });

  // A saved session opens straight on the roster; otherwise log in first.
  const returnTab = panel.getByRole('tab', { name: /Return to a hero/i });
  if (await returnTab.isVisible().catch(() => false)) {
    await clickThrough(returnTab);
    await panel.locator('#return-login').fill(login);
    await panel.locator('#return-password').fill(password);
    await clickThrough(panel.getByRole('button', { name: /^Continue$/ }));
  }

  const card = character
    ? panel.locator('li.lobby-card', { hasText: character }).first()
    : panel.locator('li.lobby-card').first();
  await clickThrough(card.getByRole('button', { name: /^Enter$/ }), 30_000);
  await waitOnline(page);
  return 'hero';
}

/** Dismiss the first-run welcome card so it never lands in a screenshot. */
export async function dismissWelcome(page) {
  try { await page.getByRole('button', { name: /got it/i }).click({ timeout: 4000 }); } catch { /* not shown */ }
}
