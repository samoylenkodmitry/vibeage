// GM-teleport world tour: logs in, waits for in-game daylight, teleports to
// each location (the GM gmTeleport e2e hook), screenshots 3 yaws per stop.
// Headed chromium on the real GPU; the HUD is CSS-hidden so shots are clean.
//   DISPLAY=:0.0 [TOUR_LOGIN=a TOUR_PASSWORD=a TOUR_CHARACTER=name] \
//   [ZOOM_NOTCHES=0..5] node scripts/world-tour.mjs <outPrefix> "name:x,z" ...
import { chromium } from '@playwright/test';

const prefix = process.argv[2] || '/tmp/tour';
const stops = process.argv.slice(3).map((arg) => {
  const match = /^(.+):(-?[\d.]+),(-?[\d.]+)$/.exec(arg);
  if (!match) {
    console.error(`[tour] bad stop "${arg}" — expected "name:x,z"`);
    process.exit(1);
  }
  // Sanitize the name: it becomes part of the screenshot filename.
  const name = match[1].replace(/[^a-zA-Z0-9_-]/g, '_');
  return { name, x: Number(match[2]), z: Number(match[3]) };
});
const DAY_MS = 12 * 60 * 1000;
const phaseNow = () => (Date.now() % DAY_MS) / DAY_MS;

const browser = await chromium.launch({
  headless: false, // SwiftShader can't rasterize med/high tiers — needs the real GPU
  // System chromium by default (bundled headless = SwiftShader); override on
  // other machines via CHROME_PATH, or set it empty to use the bundled one.
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  args: ['--window-size=660,440', '--window-position=20,20'],
});
const page = await browser.newPage({ viewport: { width: 660, height: 440 } });
const log = (m) => console.log(`[tour] ${m}`);
try {
  await page.goto('https://vibeage.eu/', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-input').fill(process.env.TOUR_LOGIN ?? 'a');
  await page.locator('#password-input').fill(process.env.TOUR_PASSWORD ?? 'a');
  await page.getByRole('button', { name: /^Continue$/i }).click();
  try { if (process.env.TOUR_CHARACTER) await page.getByText(process.env.TOUR_CHARACTER, { exact: true }).first().click({ timeout: 6000 }); } catch { /* no character select screen */ }
  await page.getByRole('button', { name: /Enter World/i }).first().click({ timeout: 20_000 });
  await page.locator('canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === 'online' && Boolean(s.myPlayerId);
  }, undefined, { timeout: 30_000 });
  log('online');
  try { await page.getByRole('button', { name: /got it/i }).click({ timeout: 3000 }); } catch { /* no welcome toast */ }
  const respawn = page.getByRole('button', { name: /^Respawn$/i });
  for (let i = 0; i < 3 && await respawn.isVisible().catch(() => false); i += 1) {
    await respawn.click(); await page.waitForTimeout(2500);
  }
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }' });
  await page.waitForTimeout(6000);
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // zoom out (ZOOM_NOTCHES wheel steps; 0 = close quarters), slight pitch up
  const zoomNotches = Number(process.env.ZOOM_NOTCHES ?? 5);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < zoomNotches; i += 1) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(cx, cy - 14, { steps: 6 });
  await page.mouse.up({ button: 'right' });

  // wait for a good daylight window (phase 0.12..0.55 of the 12-min cycle);
  // SKIP_DAYLIGHT_WAIT=1 shoots whatever the current light is (debug runs)
  while (!process.env.SKIP_DAYLIGHT_WAIT && (phaseNow() < 0.12 || phaseNow() > 0.55)) {
    log(`waiting for daylight (phase ${phaseNow().toFixed(2)})`);
    await page.waitForTimeout(20_000);
  }
  log(`shooting (phase ${phaseNow().toFixed(2)})`);

  for (const stop of stops) {
    await page.evaluate(([x, z]) => window.__VIBEAGE_VITE_E2E__?.gmTeleport(x, z), [stop.x, stop.z]);
    const arrived = await page.waitForFunction(([x, z]) => {
      const p = window.__VIBEAGE_VITE_E2E__?.getState()?.lastKnownPlayerPosition;
      return p && Math.hypot(p.x - x, p.z - z) < 8;
    }, [stop.x, stop.z], { timeout: 10_000 }).catch(() => null);
    if (!arrived) { log(`${stop.name}: TELEPORT DID NOT LAND`); continue; }
    log(`${stop.name}: arrived`);
    await page.waitForTimeout(8000); // chunk/GLB streaming
    for (let yaw = 0; yaw < 3; yaw += 1) {
      await page.screenshot({ path: `${prefix}-${stop.name}-${yaw}.png`, animations: 'disabled' });
      await page.mouse.move(cx, cy);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(cx + 175, cy, { steps: 10 });
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(500);
    }
    log(`${stop.name}: 3 shots`);
  }
} catch (err) {
  log(`FAILED: ${err.message.split('\n')[0]}`);
  await page.screenshot({ path: `${prefix}-fail.png` }).catch(() => undefined);
} finally {
  await browser.close();
}
