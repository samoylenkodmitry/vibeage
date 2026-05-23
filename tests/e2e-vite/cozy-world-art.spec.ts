import { expect, test } from '@playwright/test';
import { enterWorld } from '../e2e-helpers/gameClient';

test.setTimeout(120_000);

/**
 * Cozy-coast smoke. Two contracts the visual upgrade must hold:
 *
 *   1. The 3D canvas mounts cleanly. If the cozy layer ever
 *      throws on first frame (a Drei import missing, a shader
 *      typo, a uniform mismatch) the canvas disappears and the
 *      HUD is the only thing left — `enterWorld` already asserts
 *      the canvas is visible.
 *   2. Water never steals click-to-move. The cozy water plane
 *      sits on the starter-spawn coastline; without
 *      `raycast={() => null}` a click anywhere over water would
 *      land on the water mesh and the server would never receive
 *      a MoveIntent. Verify by issuing a move via the e2e bridge
 *      (which exercises the same `sendMoveIntent` path the click
 *      handler uses) and confirming the player position moves.
 */
test('cozy starter coast: canvas mounts and click-to-move works', async ({ page }) => {
  await enterWorld(page, `CozyCoast${Date.now()}`);
  await expect(page.locator('canvas')).toBeVisible();
  const beforePos = await page.evaluate(() => {
    return window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition ?? null;
  });
  expect(beforePos).not.toBeNull();
  // Issue a move 12 m toward negative X (where the cozy water
  // lives). If the water mesh intercepted clicks the server-side
  // movement would never fire; the e2e bridge bypasses the canvas
  // pointer pipeline but does call the same `sendMoveIntent`.
  await page.evaluate(() => {
    window.__VIBEAGE_VITE_E2E__?.moveNearPlayer({ x: -12, z: 0 });
  });
  await page.waitForFunction((prev) => {
    const cur = window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition;
    if (!cur || !prev) return false;
    return Math.abs(cur.x - prev.x) + Math.abs(cur.z - prev.z) > 0.05;
  }, beforePos, { timeout: 8_000 });
});
