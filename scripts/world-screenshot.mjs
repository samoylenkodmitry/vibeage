// Headless screenshot of the LIVE world so the dev can self-verify world-art
// changes instead of shipping blind. CPU rendering (SwiftShader) — does NOT use
// the machine's GPU. The page drops straight into the world (no login screen),
// so by default this shoots as the Nameless guest; set SHOT_LOGIN/SHOT_PASSWORD
// to enter a specific account's hero through the in-world identity panel.
//
//   [SHOT_LOGIN=a SHOT_PASSWORD=a [SHOT_CHARACTER=name]] \
//   node scripts/world-screenshot.mjs [outPath] [waitMs]
import { chromium } from '@playwright/test';
import { dismissWelcome, enterWorld } from './lib/enter-world.mjs';

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
  log('loaded');
  const as = await enterWorld(page, {
    login: process.env.SHOT_LOGIN,
    password: process.env.SHOT_PASSWORD,
    character: process.env.SHOT_CHARACTER,
  });
  log(`online as ${as}`);
  await dismissWelcome(page);
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
