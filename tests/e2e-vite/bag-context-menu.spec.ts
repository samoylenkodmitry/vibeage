import { expect, test } from "@playwright/test";
import { enterWorld } from "../e2e-helpers/gameClient";

test.setTimeout(120_000);

/**
 * Bag context menu regression — right-click and long-press both
 * open the BagContextMenu (Use / Equip / Drop / Destroy / Wiki),
 * NOT the item tooltip (which only has the wiki link).
 *
 * PR #475 introduced the trigger-option override that routes both
 * gestures to the action menu; this E2E pins the wire so a future
 * spread-order / option-mismatch regression fails in CI.
 */

test('right-click on a populated bag slot opens the BagContextMenu', async ({ page }) => {
  // Capture browser console — print everything so we can see why
  // right-click is or isn't reaching the React handler.
  page.on('console', (msg) => {
    process.stdout.write(`[browser/${msg.type()}] ${msg.text()}\n`);
  });

  await enterWorld(page, `BagRClick${Date.now()}`);

  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__));

  // Grant ourselves a health potion via the server's GmCommand
  // (the Vite e2e config has VIBEAGE_ENABLE_DEV_COMMANDS=1).
  await page.evaluate(() => {
    window.__VIBEAGE_VITE_E2E__?.grantItem('health_potion', 3);
  });

  // Wait for the inventory to reflect the grant.
  await page.waitForFunction(() => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    return inv.some((s) => s.itemId === 'health_potion' && s.quantity >= 1);
  }, undefined, { timeout: 20_000 });

  // Open the bag panel.
  await page.getByRole('button', { name: /show bag/i }).click();
  await expect(page.locator('.inventory-panel')).toBeVisible();

  // Find the first populated slot (has text content / quantity).
  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await expect(populated).toBeEnabled();

  await populated.click({ button: 'right' });

  // Assert the action menu appears.
  const menu = page.locator('.bag-context-menu');
  await expect(menu).toBeVisible({ timeout: 5_000 });
  await expect(menu.getByRole('menuitem', { name: /Drop on ground/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Destroy/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Open in Wiki/i })).toBeVisible();
});
