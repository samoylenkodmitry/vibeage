import { expect, test } from "@playwright/test";
import {
  enterWorld,
  getClientState,
} from "../e2e-helpers/gameClient";

test.setTimeout(120_000);

/**
 * §52 playtest follow-up — UI flow tests for the two HUD bugs:
 *
 *   1. NPC dialog should have a × button that closes it (also
 *      Escape + outside-click). The e2e here drives the × button
 *      because the keyboard/pointer-outside paths run through
 *      window/document listeners that Playwright's `dispatchEvent`
 *      doesn't always route the same way as a real user gesture.
 *
 *   2. (Quest tracker switching is covered by the unit tests in
 *      tests/questTracker.spec.ts. A multi-active-quest e2e
 *      requires walking to Galen + Mira and accepting two quests,
 *      which is several minutes of in-game travel — out of scope
 *      for this PR. The pickTrackedStage logic test catches the
 *      'sticks to first quest' regression directly.)
 */

async function walkToGalen(page: import("@playwright/test").Page): Promise<void> {
  // Galen lives at (4, 4) on the world plane. Spawn is at (0, 0).
  // Send a move intent toward Galen and wait until the player is
  // within INTERACTION_RANGE (4 units).
  await page.evaluate(() => {
    window.__VIBEAGE_VITE_E2E__?.moveNearPlayer({ x: 4, z: 4 });
  });
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    const pos = state?.lastKnownPlayerPosition;
    if (!pos) return false;
    const dx = pos.x - 4;
    const dz = pos.z - 4;
    return Math.hypot(dx, dz) <= 3.5;
  }, undefined, { timeout: 30_000 });
}

test('NPC dialog: × close button hides the dialog until the player leaves and returns', async ({ page }) => {
  await enterWorld(page, `NpcDialog${Date.now()}`);

  await walkToGalen(page);

  // The dialog auto-opens within range. Wait for its title to
  // render — Galen's name is the strong header.
  const dialog = page.getByRole('region', { name: /Dialog with Warden Galen/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // The × button has aria-label "Close dialog" so screen-reader
  // users + this test can find it.
  const closeButton = page.getByRole('button', { name: 'Close dialog' });
  await expect(closeButton).toBeVisible();
  await closeButton.click();

  // After the × click the dialog should go away even though the
  // player is still in range.
  await expect(dialog).toBeHidden({ timeout: 5_000 });

  // Confirm the player is still within Galen's interaction range
  // so the dialog stays dismissed for the right reason (it's the
  // dismiss working, not the player wandering off).
  const state = await getClientState(page);
  const pos = state?.lastKnownPlayerPosition;
  expect(pos).toBeTruthy();
  const dx = (pos!.x as number) - 4;
  const dz = (pos!.z as number) - 4;
  expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(3.5);
});

test('QuestTrackerStrip: clicking the heads-up strip opens the Quest panel (§52 merge)', async ({ page }) => {
  await enterWorld(page, `QuestStrip${Date.now()}`);
  await walkToGalen(page);

  // Open NpcDialog, accept the first offered quest. The strip won't
  // render until the player has at least one active quest.
  const dialog = page.getByRole('region', { name: /Dialog with Warden Galen/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const acceptButton = dialog.getByRole('button', { name: 'Accept' }).first();
  await acceptButton.click();

  // Wait for the strip to show the accepted quest.
  const strip = page.getByRole('button', { name: /Tracked quest:/i });
  await expect(strip).toBeVisible({ timeout: 10_000 });

  // The strip used to carry inline Next/Claim/Show-on-map buttons
  // that duplicated the Quest panel. After the §52 merge the strip
  // is a single click-target — no nested action buttons.
  await expect(strip.getByRole('button', { name: 'Next' })).toHaveCount(0);
  await expect(strip.getByRole('button', { name: 'Claim' })).toHaveCount(0);

  // Quest panel starts closed; clicking the strip opens it.
  const panel = page.getByRole('region', { name: 'Quests' });
  await expect(panel).toBeHidden();
  await strip.click();
  await expect(panel).toBeVisible({ timeout: 5_000 });
});
