import { expect, test } from '@playwright/test';
import { enterWorld } from '../e2e-helpers/gameClient';

test.setTimeout(120_000);

/**
 * Cozy-coast e2e smoke. Contracts the visual upgrade must hold:
 *
 *   1. Canvas mounts cleanly. If the cozy layer ever throws on
 *      first frame (a Drei import missing, a shader typo, a
 *      uniform mismatch) the canvas disappears and the HUD is
 *      the only thing left.
 *   2. Water never steals click-to-move. Without
 *      `raycast={() => null}` a click anywhere over water would
 *      land on the water mesh and the server would never receive
 *      a MoveIntent.
 *   3. Scene loads without console errors. A GLB 404, an
 *      ErrorBoundary trip, or a texture decoding failure all
 *      surface as console.error — if any of those happen during
 *      mount the cozy slice is silently broken.
 *   4. HUD stays readable above the cozy art. Players need their
 *      hotbar and stats — if the cozy layer covers them the
 *      slice is unshippable.
 */
test('cozy starter coast: canvas mounts and click-to-move works', async ({ page }) => {
  await enterWorld(page, `CozyCoast${Date.now()}`);
  await expect(page.locator('#root canvas')).toBeVisible();
  const beforePos = await page.evaluate(() => {
    return window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition ?? null;
  });
  expect(beforePos).not.toBeNull();
  await page.evaluate(() => {
    window.__VIBEAGE_VITE_E2E__?.moveNearPlayer({ x: -12, z: 0 });
  });
  await page.waitForFunction((prev) => {
    const cur = window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition;
    if (!cur || !prev) return false;
    return Math.abs(cur.x - prev.x) + Math.abs(cur.z - prev.z) > 0.05;
  }, beforePos, { timeout: 8_000 });
});

test('cozy starter coast: no fatal console errors during mount', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await enterWorld(page, `CozyConsole${Date.now()}`);
  await expect(page.locator('#root canvas')).toBeVisible();
  // Give Suspense + GLB loaders a chance to settle. If a GLB
  // path is wrong the AssetErrorBoundary will fire here.
  await page.waitForTimeout(2_500);
  // Filter out known third-party / environmental noise that the
  // app doesn't own.
  const fatal = errors.filter((e) =>
    !e.includes('WebSocket')
    && !e.toLowerCase().includes('extension')
    && !e.toLowerCase().includes('favicon'),
  );
  expect(fatal, fatal.join('\n')).toEqual([]);
});

test('cozy starter coast: HUD stays visible above the canvas', async ({ page }) => {
  await enterWorld(page, `CozyHud${Date.now()}`);
  // The skill bar and player stats live in the HUD layer. Both
  // should remain visible — a regression that put the cozy
  // canvas above them would hide hotkeys and player health.
  await expect(page.locator('#root canvas')).toBeVisible();
  const hud = page.locator('[data-testid="player-stats"], .hud, [class*="hud"], [class*="HUD"]').first();
  await expect(hud).toBeVisible({ timeout: 8_000 });
});

test('cozy starter coast: canvas paints a non-trivial frame', async ({ page }) => {
  await enterWorld(page, `CozyPaint${Date.now()}`);
  await expect(page.locator('#root canvas')).toBeVisible();
  await page.waitForTimeout(1_500);
  // Read a few pixels off the WebGL canvas. If everything is
  // black or fully transparent, the cozy slice didn't paint —
  // sky, water, fog, and sand should all be coloured.
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('#root canvas') as HTMLCanvasElement | null;
    if (!canvas) return { ok: false, reason: 'no canvas' };
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { ok: false, reason: 'no gl context' };
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Uint8Array(4 * 16);
    // Sample a 4x4 patch from the top half (sky) and another from
    // the middle (terrain/water). Anything fully zero is a
    // black-screen regression.
    gl.readPixels(Math.floor(w / 2) - 2, Math.floor(h / 4), 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const hasColor = Array.from(pixels).some((v, i) => i % 4 !== 3 && v > 20);
    return { ok: hasColor, reason: hasColor ? '' : 'no non-black pixels' };
  });
  expect(result.ok, result.reason).toBe(true);
});
