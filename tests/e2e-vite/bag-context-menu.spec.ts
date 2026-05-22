import { expect, test } from "@playwright/test";
import { enterWorld } from "../e2e-helpers/gameClient";

test.setTimeout(120_000);

/**
 * Bag context menu regression suite. Two paths to the same menu:
 *  - The always-visible ⋯ button on every populated slot
 *    (`.inventory-slot-menu`). This is the gesture-independent
 *    primary path and the one the test must pin.
 *  - Right-click on the slot body, as a power-user shortcut.
 *
 * Earlier attempts relied purely on right-click, which on the
 * user's Mac browser produced no reaction (layout overlap + Safari
 * quirks). The ⋯ button architecture removes the dependency on
 * any specific gesture.
 */

async function seedAndOpenBag(page: import('@playwright/test').Page, label: string) {
  await enterWorld(page, label);
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__));
  await page.evaluate(() => {
    window.__VIBEAGE_VITE_E2E__?.grantItem('health_potion', 3);
  });
  await page.waitForFunction(() => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    return inv.some((s) => s.itemId === 'health_potion' && s.quantity >= 1);
  }, undefined, { timeout: 20_000 });
  await page.getByRole('button', { name: /show bag/i }).click();
  await expect(page.locator('.inventory-panel')).toBeVisible();
}

test('⋯ button on a populated bag slot opens the BagContextMenu', async ({ page }) => {
  await seedAndOpenBag(page, `BagMenuBtn${Date.now()}`);

  // The visible menu button on every populated slot — the path
  // every device can take regardless of right-click support.
  const menuBtn = page.locator('.inventory-slot-menu').first();
  await expect(menuBtn).toBeVisible();
  await menuBtn.click();

  const menu = page.locator('.bag-context-menu');
  await expect(menu).toBeVisible({ timeout: 5_000 });
  await expect(menu.getByRole('menuitem', { name: /Drop on ground/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Destroy/i })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Open in Wiki/i })).toBeVisible();
});

test('right-click on a populated bag slot also opens the menu (shortcut)', async ({ page }) => {
  await seedAndOpenBag(page, `BagRClick${Date.now()}`);

  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await expect(populated).toBeEnabled();
  await populated.click({ button: 'right' });

  const menu = page.locator('.bag-context-menu');
  await expect(menu).toBeVisible({ timeout: 5_000 });
});
