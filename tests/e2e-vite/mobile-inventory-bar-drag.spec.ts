import { test, expect, devices } from '@playwright/test';
import { enterWorld, openPanelRail } from '../e2e-helpers/gameClient';

/**
 * Touch parity with the skill bar: a bag item can't use native HTML5 drag on a
 * touch device (it's gated to mouse pointers), so dragging a potion onto the
 * action bar used to be impossible — only the tooltip's "Bind to shortcut" menu
 * worked. InventorySlotButton now feeds the same long-press pointer drag
 * controller the skill bar uses ({ kind: 'item' }), so a hold-and-drag from the
 * bag binds the item to a bar slot. Drives the real touch flow via CDP
 * (chromium → pointerType:touch). Fresh characters spawn with a full starter
 * bag, so an item is always present to drag.
 */
test.use({ ...devices['Pixel 5'] });
test.setTimeout(120_000);

test('touch: long-press dragging a bag item onto an empty bar slot binds it', async ({ page }) => {
  await enterWorld(page, `MobInvDrag${Date.now()}`);
  try { await page.getByRole('button', { name: /got it/i }).click({ timeout: 5_000 }); } catch { /* no welcome */ }

  // Grant a health potion to drag: the first starter slot is the Worn Sword
  // (equipment), which isn't bar-bindable, so a long-press there never starts a
  // drag. Target the potion specifically by its aria-label.
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__));
  await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.grantItem('health_potion', 3));
  await page.waitForFunction(
    () => (window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? []).some((s) => s.itemId === 'health_potion'),
    undefined, { timeout: 20_000 },
  );

  await openPanelRail(page); // phones: reveal the collapsed toggle rail first
  await page.getByRole('button', { name: /\bbag\b/i }).click(); // "Show Bag" toggle
  const source = page.locator('.inventory-slot[aria-label^="Health Potion"]').first();
  await expect(source).toBeVisible();

  const slot = page.locator('.skill-bar-slot').filter({ hasText: /empty/i }).first();
  await expect(slot, 'need an empty bar slot to drop onto').toBeVisible();

  const sb = (await source.boundingBox())!;
  const tb = (await slot.boundingBox())!;
  const sx = Math.round(sb.x + sb.width / 2), sy = Math.round(sb.y + sb.height / 2);
  const tx = Math.round(tb.x + tb.width / 2), ty = Math.round(tb.y + tb.height / 2);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 0 }] });
  await page.waitForTimeout(480); // past the 350ms long-press threshold (matches mobile-skill-bar-drag)
  await expect(page.locator('.action-bar-drag-ghost')).toBeVisible(); // item picked up
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round((sx + tx) / 2), y: Math.round((sy + ty) / 2), id: 0 }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx, y: ty, id: 0 }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect(slot).not.toContainText('Empty', { timeout: 3_000 });
});
