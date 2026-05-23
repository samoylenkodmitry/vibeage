import { expect, test, type Page } from '@playwright/test';
import { enterWorld } from '../e2e-helpers/gameClient';

test.setTimeout(120_000);

async function seedAndOpenBag(page: Page, label: string): Promise<void> {
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

test('click on a bag slot opens a sticky ItemTooltip that survives pointer-leave', async ({ page }) => {
  await seedAndOpenBag(page, `BagClickSticky${Date.now()}`);
  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await expect(populated).toBeVisible();

  // Plain click → sticky tooltip
  await populated.click();
  const tooltip = page.locator('.item-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 3_000 });

  // Move pointer far away and wait longer than the auto-close grace
  // window (200 ms) — sticky tooltip must NOT close.
  await page.mouse.move(20, 20);
  await page.waitForTimeout(500);
  await expect(tooltip).toBeVisible();

  // Close button (×) must dismiss it.
  await tooltip.getByRole('button', { name: /close tooltip/i }).click();
  await expect(tooltip).toBeHidden({ timeout: 1_000 });
});

test('sticky tooltip exposes Use button for a consumable', async ({ page }) => {
  await seedAndOpenBag(page, `BagClickUse${Date.now()}`);
  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await populated.click();
  const tooltip = page.locator('.item-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 3_000 });
  await expect(tooltip.getByRole('button', { name: /^Use$/i })).toBeVisible();
});

test('dragging a bag slot onto the world drops the stack at the player\'s feet', async ({ page }) => {
  await seedAndOpenBag(page, `BagDragToWorld${Date.now()}`);
  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await expect(populated).toBeVisible();

  // Native HTML5 drag-and-drop via Playwright. Playwright supports
  // .dragTo() which fires the full dragstart/dragover/drop sequence
  // including the dataTransfer payload set by onDragStart.
  const canvas = page.locator('canvas').first();
  await populated.dragTo(canvas, { force: true });

  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return (s?.groundLootIds?.length ?? 0) >= 1;
  }, undefined, { timeout: 5_000 });
});

test('dragging a bag slot onto a skill-bar slot binds the item and 1-key uses it', async ({ page }) => {
  await seedAndOpenBag(page, `BagDragToBar${Date.now()}`);
  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await expect(populated).toBeVisible();
  const emptySlot = page.locator('.skill-bar-slot').nth(1); // slot index 1 ('2' key)
  await expect(emptySlot).toBeVisible();

  // HTML5 drag-and-drop via dispatched events — Playwright's mouse-
  // based `dragTo()` does not always carry the dataTransfer payload
  // across to the drop target in headless Chromium, so we drive the
  // sequence by hand. This mirrors what the browser fires when a real
  // user grips a bag slot and releases over a skill-bar slot.
  await page.evaluate(() => {
    // Find the health-potion slot specifically — the mage's starter
    // inventory also contains a Worn Sword, and picking just "first
    // non-disabled slot" would grab that instead.
    const slots = Array.from(document.querySelectorAll<HTMLElement>('.inventory-slot'));
    const source = slots.find((el) => /^H/i.test(el.textContent ?? ''));
    const target = document.querySelectorAll<HTMLElement>('.skill-bar-slot')[1];
    if (!source || !target) throw new Error('source/target missing');
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });

  const boundSlot = page.locator('.skill-button--item').first();
  await expect(boundSlot).toBeVisible({ timeout: 3_000 });
  await expect(boundSlot).toContainText(/x[1-9]/i);
  await expect(boundSlot).toContainText(/Health Potion/i);

  const beforeQty = await page.evaluate(() => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    return inv.find((s) => s.itemId === 'health_potion')?.quantity ?? 0;
  });
  await boundSlot.click();
  await page.waitForFunction((prev) => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    const cur = inv.find((s) => s.itemId === 'health_potion')?.quantity ?? 0;
    return cur < prev;
  }, beforeQty, { timeout: 5_000 });
});

test('Bind to shortcut from the bag tooltip binds the item to the chosen slot (touch path)', async ({ page }) => {
  await seedAndOpenBag(page, `BagBindTooltip${Date.now()}`);
  const populated = page.locator('.inventory-slot').filter({ hasText: /^H/i }).first();
  await populated.click();
  const tooltip = page.locator('.item-tooltip');
  await expect(tooltip).toBeVisible({ timeout: 3_000 });
  // Tap the "Bind to shortcut" button to open the picker.
  await tooltip.getByRole('button', { name: /Bind to shortcut/i }).click();
  // Picker grid renders the 1..0 + Q..P labels — pick the '2' slot.
  await tooltip.getByRole('button', { name: /Bind to slot 2/i }).click();
  // Bound slot appears on the skill bar.
  const boundSlot = page.locator('.skill-button--item').first();
  await expect(boundSlot).toBeVisible({ timeout: 3_000 });
  await expect(boundSlot).toContainText(/Health Potion/i);
});

test('passive class skills do not appear in the shortcut bar', async ({ page }) => {
  await enterWorld(page, `PassiveFilter${Date.now()}`);
  // Mage's auto passive is passive_arcane_focus. Skill-bar must
  // never render a button labelled "Arcane Focus" — passives are
  // filtered out client-side and the server refuses them on
  // SetSkillShortcut so any persisted assignment self-heals.
  await expect(page.locator('.skill-button')).not.toHaveCount(0);
  const passiveSlot = page.locator('.skill-button__name', { hasText: /Arcane Focus/i });
  await expect(passiveSlot).toHaveCount(0);
});
