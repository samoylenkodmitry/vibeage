import { test, expect, devices } from '@playwright/test';
import { enterWorld, openPanelRail } from '../e2e-helpers/gameClient';

/**
 * Regression: on a touch device the system chat panel used to sit ON TOP of the
 * action/skill bars (chat z-index 7 vs skill-bar 5 / actions-panel 6), so a finger
 * press over a skill landed on the chat list instead — the long-press drag never
 * started and nothing bound. The bars must be above the chat so touch drag-to-bar
 * works. Drives the real touch flow via CDP (chromium → pointerType:touch).
 */
test.use({ ...devices['Pixel 5'] });
test.setTimeout(120_000);

test('touch: dragging a skill onto an empty bar slot binds it', async ({ page }) => {
  await enterWorld(page, `MobBarDrag${Date.now()}`);
  try { await page.getByRole('button', { name: /got it/i }).click({ timeout: 5_000 }); } catch { /* no welcome */ }

  // Phones collapse the action buttons (Attack/Move/…) behind the panel rail.
  // Open it and show the Actions panel so there's a drag source.
  await openPanelRail(page);
  await page.getByRole('button', { name: /show actions/i }).click();
  const source = page.locator('.actions-panel .action-button').first();
  await expect(source).toBeVisible();

  // The skill source must be the top hit target — i.e. NOT covered by the chat
  // overlay. This is the actual z-index regression guard.
  const onTop = await source.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return Boolean((document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement)?.closest('.action-button'));
  });
  expect(onTop, 'skill source must be on top, not under the chat panel').toBe(true);

  const slot = page.locator('.skill-bar-slot').filter({ hasText: /empty/i }).first();
  await expect(slot, 'need an empty bar slot to drop onto').toBeVisible();

  const sb = (await source.boundingBox())!;
  const tb = (await slot.boundingBox())!;
  const sx = Math.round(sb.x + sb.width / 2), sy = Math.round(sb.y + sb.height / 2);
  const tx = Math.round(tb.x + tb.width / 2), ty = Math.round(tb.y + tb.height / 2);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 0 }] });
  await page.waitForTimeout(480); // past the 350ms long-press threshold
  await expect(page.locator('.action-bar-drag-ghost')).toBeVisible(); // drag picked up
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round((sx + tx) / 2), y: Math.round((sy + ty) / 2), id: 0 }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx, y: ty, id: 0 }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect(slot).not.toContainText('Empty', { timeout: 3_000 });
});
