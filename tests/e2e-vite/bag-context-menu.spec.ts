import { expect, test } from "@playwright/test";
import { enterWorld } from "../e2e-helpers/gameClient";

test.setTimeout(120_000);

/**
 * Bag actions live inside the ItemTooltip (rendered on hover,
 * long-press, or right-click). Drop / Destroy / Use / Equip /
 * Open in Wiki are all rendered as buttons at the bottom of the
 * tooltip. This e2e pins the wire so the action surface can't
 * regress to gesture-dependent code again.
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

test('hover on a populated bag slot opens the ItemTooltip with action buttons', async ({ page }) => {
  await seedAndOpenBag(page, `BagTooltip${Date.now()}`);

  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await expect(populated).toBeVisible();
  await populated.hover();

  // The tooltip's hover-open delay is 350ms; allow up to 5s.
  const tooltip = page.locator('.item-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 5_000 });

  // The action row is appended at the bottom of the tooltip.
  await expect(tooltip.getByRole('button', { name: /^Drop on ground$/i })).toBeVisible();
  await expect(tooltip.getByRole('button', { name: /^Destroy$/i })).toBeVisible();
  await expect(tooltip.getByRole('button', { name: /Open in Wiki/i })).toBeVisible();
  // Health Potion is a consumable, so the Use button is offered.
  await expect(tooltip.getByRole('button', { name: /^Use$/i })).toBeVisible();
});

test('drop → pickup via the actions-panel Pickup (F) button', async ({ page }) => {
  await seedAndOpenBag(page, `BagBtnPickup${Date.now()}`);

  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await populated.hover();
  await expect(page.locator('.item-tooltip')).toBeVisible({ timeout: 5_000 });
  await page.locator('.item-tooltip').getByRole('button', { name: /^Drop on ground$/i }).click();

  await page.waitForFunction(() => {
    const lootIds = window.__VIBEAGE_VITE_E2E__?.getState().groundLootIds ?? [];
    return lootIds.length >= 1;
  }, undefined, { timeout: 10_000 });

  const pickupBtn = page.getByRole('button', { name: /Pickup \(F\)/i });
  await expect(pickupBtn).toBeEnabled();
  await pickupBtn.click();

  await page.waitForFunction(() => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    return inv.some((s) => s.itemId === 'health_potion' && s.quantity >= 1);
  }, undefined, { timeout: 10_000 });
});

test('drop → pickup round-trip via the in-world loot pile click', async ({ page }) => {
  await seedAndOpenBag(page, `BagClickPickup${Date.now()}`);

  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await populated.hover();
  await expect(page.locator('.item-tooltip')).toBeVisible({ timeout: 5_000 });
  await page.locator('.item-tooltip').getByRole('button', { name: /^Drop on ground$/i }).click();

  await page.waitForFunction(() => {
    const lootIds = window.__VIBEAGE_VITE_E2E__?.getState().groundLootIds ?? [];
    return lootIds.length >= 1;
  }, undefined, { timeout: 10_000 });

  // Use the e2e pickup hook (mirrors what clicking the in-world
  // loot mesh does — calls walkThenPickup with the loot id).
  const lootId = await page.evaluate(() => {
    return window.__VIBEAGE_VITE_E2E__?.pickUpFirstLoot();
  });
  expect(lootId).not.toBeNull();

  await page.waitForFunction(() => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    return inv.some((s) => s.itemId === 'health_potion' && s.quantity >= 1);
  }, undefined, { timeout: 10_000 });
});

test('drop → pickup round-trip via the tooltip Drop button + F hotkey', async ({ page }) => {
  await seedAndOpenBag(page, `BagDropPickup${Date.now()}`);

  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await populated.hover();
  const tooltip = page.locator('.item-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 5_000 });

  await tooltip.getByRole('button', { name: /^Drop on ground$/i }).click();

  // After the drop the bag should be empty AND ground loot should
  // exist at the player's feet.
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    const inv = s?.inventoryItems ?? [];
    const lootIds = s?.groundLootIds ?? [];
    return inv.every((slot) => slot.itemId !== 'health_potion' || slot.quantity === 0)
      && lootIds.length >= 1;
  }, undefined, { timeout: 10_000 });

  // Press F to pick the nearest loot stack back up.
  await page.keyboard.press('KeyF');

  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    const inv = s?.inventoryItems ?? [];
    return inv.some((slot) => slot.itemId === 'health_potion' && slot.quantity >= 1);
  }, undefined, { timeout: 10_000 });
});

test('clicking the Destroy button removes the stack from the bag', async ({ page }) => {
  await seedAndOpenBag(page, `BagDestroy${Date.now()}`);

  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await populated.hover();

  const tooltip = page.locator('.item-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 5_000 });

  await tooltip.getByRole('button', { name: /^Destroy$/i }).click();

  // The inventory should no longer contain the stack.
  await page.waitForFunction(() => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    return !inv.some((s) => s.itemId === 'health_potion' && s.quantity > 0);
  }, undefined, { timeout: 10_000 });
});
