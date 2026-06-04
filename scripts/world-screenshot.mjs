// Headless screenshot of the LIVE world so the dev can self-verify world-art
// changes instead of shipping blind. CPU rendering (SwiftShader) — does NOT use
// the machine's GPU. Logs in with the a/a smoke account, enters the world, waits
// for the scene to settle, and writes a PNG.
//
//   node scripts/world-screenshot.mjs [outPath] [waitMs]
import { chromium } from '@playwright/test';

const out = process.argv[2] || '/tmp/world.png';
const settleMs = Number(process.argv[3] || 9000);
const domain = process.env.DOMAIN || 'vibeage.eu';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', // CPU WebGL, no GPU
    '--ignore-gpu-blocklist', '--enable-webgl',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const log = (m) => console.log(`[shot] ${m}`);
try {
  await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded' });
  log('loaded login');
  await page.locator('#login-input').fill('a');
  await page.locator('#password-input').fill('a');
  await page.getByRole('button', { name: /^Continue$/i }).click();
  log('submitted login');
  await page.getByRole('button', { name: /Enter World/i }).first().click({ timeout: 20_000 });
  log('clicked enter world');
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 30_000 });
  log('canvas visible');
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online' && Boolean(s.myPlayerId);
  }, undefined, { timeout: 30_000 });
  log('online');
  try { await page.getByRole('button', { name: /got it/i }).click({ timeout: 4000 }); } catch { /* no welcome */ }
  // The smoke account may be dead — respawn to a safe spawn point. Only act if
  // the button is actually present (no fixed wait when already alive).
  const respawn = page.getByRole('button', { name: /^Respawn$/i });
  for (let i = 0; i < 3 && await respawn.isVisible().catch(() => false); i += 1) {
    await respawn.click();
    log('respawned');
    await page.waitForTimeout(2500);
  }
  // Close any open HUD panels (account state may have Stats/Actions/Bag open) so
  // the 3D world is unobstructed.
  await page.evaluate(() => {
    document.querySelectorAll('button.panel-toggle--open').forEach((b) => b.click());
    document.querySelectorAll('button').forEach((b) => {
      if (/^(close|×|✕)/i.test(b.textContent?.trim() ?? '')) b.click();
    });
  });
  await page.waitForTimeout(settleMs); // let GLBs/foliage/day-phase settle
  await page.screenshot({ path: out, fullPage: false, timeout: 60_000, animations: 'disabled' });
  log(`screenshot: ${out}`);
} catch (err) {
  log(`FAILED: ${err.message.split('\n')[0]}`);
  await page.screenshot({ path: out, fullPage: false }).catch(() => { /* best effort */ });
  log(`failure screenshot: ${out}`);
} finally {
  await browser.close();
}
