#!/usr/bin/env node
/**
 * Diagnostic: log into prod with account 'a/a', capture the
 * actual inventory state + drop + pickup flow, dump everything
 * to stdout so we can see what the user is hitting.
 */
import { chromium } from '@playwright/test';

const URL = 'https://vibeage.eu/';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();

page.on('console', (msg) => {
  process.stdout.write(`[browser/${msg.type()}] ${msg.text()}\n`);
});
page.on('pageerror', (err) => {
  process.stdout.write(`[browser/pageerror] ${err.message}\n`);
});
page.on('response', (resp) => {
  if (resp.url().includes('/api/') || resp.status() >= 400) {
    process.stdout.write(`[net] ${resp.status()} ${resp.url()}\n`);
  }
});

console.log('→ Loading vibeage.eu...');
await page.goto(URL, { waitUntil: 'domcontentloaded' });

console.log('→ Filling a/a login...');
await page.fill('#login-input', 'a');
await page.fill('#password-input', 'a');
await page.click('button[type="submit"]');

console.log('→ Waiting for character select...');
await page.waitForSelector('button:has-text("Enter World")', { timeout: 30_000 });
console.log('→ Clicking Enter World for first character...');
await page.locator('button:has-text("Enter World")').first().click();

console.log('→ Waiting for world to load + e2e hooks...');
try {
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__), null, { timeout: 60_000 });
} catch {
  const url = page.url();
  const title = await page.title();
  const body = await page.evaluate(() => document.body.innerText.slice(0, 800));
  console.log('!! e2e hook never appeared. url=', url, 'title=', title);
  console.log('Body text:', body);
  await browser.close();
  process.exit(1);
}
await page.waitForFunction(() => {
  const s = window.__VIBEAGE_VITE_E2E__?.getState();
  return s?.connectionState === 'online' && s?.myPlayerId;
}, null, { timeout: 30_000 });

// Reach into the React state via the live store. Inventory items
// don't expose slotIndex on the e2e surface, but the wire payload
// does — grab it directly off the DOM by walking through React.
// Easier: read window.__VIBEAGE_DBG__ if present, otherwise eval
// against the public surface.
const initial = await page.evaluate(() => {
  const s = window.__VIBEAGE_VITE_E2E__?.getState();
  return {
    myPlayerId: s?.myPlayerId,
    inventoryItems: s?.inventoryItems,
    groundLootIds: s?.groundLootIds,
    lastKnownPlayerPosition: s?.lastKnownPlayerPosition,
  };
});
console.log('\n=== INITIAL STATE ===');
console.log(JSON.stringify(initial, null, 2));

// Open the bag.
await page.getByRole('button', { name: /show bag/i }).click().catch(() => { /* swallow */ });
await page.waitForTimeout(500);

if (!initial.inventoryItems?.some((s) => s.quantity > 0)) {
  console.log('Bag is empty already. Nothing to drop.');
  await browser.close();
  process.exit(0);
}

// Hover the first populated slot.
console.log('\n→ Hovering first populated slot...');
const populated = page.locator('.inventory-slot').filter({ has: page.locator('strong, span:not(:empty)') }).first();
await populated.hover().catch(() => { /* swallow */ });
await page.waitForTimeout(500);

// Try to click Drop in the tooltip.
const dropBtn = page.locator('.item-tooltip button:has-text("Drop on ground")').first();
if (await dropBtn.isVisible()) {
  console.log('→ Clicking Drop on ground...');
  await dropBtn.click();
} else {
  console.log('!! No Drop button visible — tooltip may not have rendered.');
}

await page.waitForTimeout(1000);

const afterDrop = await page.evaluate(() => {
  const s = window.__VIBEAGE_VITE_E2E__?.getState();
  return {
    inventoryItems: s?.inventoryItems,
    groundLootIds: s?.groundLootIds,
    combatLogTexts: s?.combatLogTexts?.slice(-10),
  };
});
console.log('\n=== AFTER DROP ===');
console.log(JSON.stringify(afterDrop, null, 2));

// Press F to attempt pickup.
console.log('\n→ Pressing F to pickup...');
await page.keyboard.press('KeyF');
await page.waitForTimeout(1500);

const afterPickup = await page.evaluate(() => {
  const s = window.__VIBEAGE_VITE_E2E__?.getState();
  return {
    inventoryItems: s?.inventoryItems,
    groundLootIds: s?.groundLootIds,
    combatLogTexts: s?.combatLogTexts?.slice(-15),
  };
});
console.log('\n=== AFTER PICKUP ATTEMPT ===');
console.log(JSON.stringify(afterPickup, null, 2));

// Count slots used.
const usedSlots = afterDrop.inventoryItems?.filter((s) => s.quantity > 0).length ?? 0;
console.log(`\nBag uses ${usedSlots} / 20 slots after drop.`);
console.log(`Ground loot stacks: ${afterPickup.groundLootIds?.length ?? 0}`);

await browser.close();
