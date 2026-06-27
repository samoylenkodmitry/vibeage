import { expect, test, type Page } from "@playwright/test";

test.setTimeout(180_000);

/**
 * Real-auth prod E2E: logs in via the actual Lobby form with the
 * `a/a` smoke account, picks the first character, and exercises
 * the bag → tooltip / drag-to-ground / drag-to-shortcut paths
 * shipped in §52 PR #487. Uses the production /api/auth path
 * directly so we don't depend on CI_AUTH_SECRET being mirrored.
 */
async function loginAndEnterWorld(page: Page): Promise<void> {
  // Everything happens in-world now (no web lobby): land as a Nameless guest,
  // open the identity panel, Return with the a/a account, pick the first hero.
  await page.goto("/");
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === "online" && Boolean(s.myPlayerId);
  }, undefined, { timeout: 30_000 });
  await page.getByRole("button", { name: /Awaken to claim your fate/i }).click();
  await page.getByRole("button", { name: /Return to a hero/i }).click();
  await page.locator("#return-login").fill("a");
  await page.locator("#return-password").fill("a");
  await page.getByRole("button", { name: /^Continue$/i }).click();
  // The hero roster appears after auth — enter the first hero on the account.
  await page.getByRole("button", { name: /^Enter$/i }).first().click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
  // Wait for the real hero (account 'a' is Lv 13) to load, not the guest (Lv 1).
  await page.waitForFunction(() => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return s?.connectionState === "online" && (s.playerVitals?.level ?? 1) >= 2;
  }, undefined, { timeout: 30_000 });
}

async function openBagWithAnyItem(page: Page): Promise<void> {
  await loginAndEnterWorld(page);
  // Account 'a' is Lv 13 with persistent inventory — no need to seed
  // anything. Just wait for ≥1 populated slot to surface from the
  // server's initial snapshot.
  await page.waitForFunction(() => {
    const inv = window.__VIBEAGE_VITE_E2E__?.getState().inventoryItems ?? [];
    return inv.some((s) => s.quantity > 0);
  }, undefined, { timeout: 20_000 });
  await page.getByRole("button", { name: /show bag/i }).click();
  await expect(page.locator(".inventory-panel")).toBeVisible();
}

test("prod a/a: click bag slot opens sticky tooltip with Close button", async ({ page }) => {
  await openBagWithAnyItem(page);
  // Dispatch click directly — Playwright's auto-wait flags the bag
  // slot as "unstable" because the panel re-renders every server tick
  // on a live prod account. The synthetic click still routes through
  // React's onClick exactly like a real user tap.
  await page.evaluate(() => {
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".inventory-slot:not([disabled])"));
    const button = slots.find((el) => /Mana Potion|Goblin Ear|Warband Horn|Slab Chip/i.test(el.getAttribute("aria-label") ?? ""));
    if (!button) throw new Error("no known item in bag");
    const rect = button.getBoundingClientRect();
    button.dispatchEvent(new MouseEvent("click", {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    }));
  });
  const tooltip = page.locator(".item-tooltip");
  await expect(tooltip).toBeVisible({ timeout: 3_000 });
  await page.mouse.move(20, 20);
  await page.waitForTimeout(500);
  await expect(tooltip).toBeVisible();
  await tooltip.getByRole("button", { name: /close tooltip/i }).click();
  await expect(tooltip).toBeHidden({ timeout: 1_000 });
});

test("prod a/a: drag bag slot to world drops the stack", async ({ page }) => {
  await openBagWithAnyItem(page);
  const beforeLoot = await page.evaluate(() =>
    window.__VIBEAGE_VITE_E2E__?.getState().groundLootIds?.length ?? 0);
  await page.evaluate(() => {
    // Pick a slot whose item is registered (avoids orphan ids like
    // 'ethereal_elixir' that may not be on the server's known list).
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".inventory-slot:not([disabled])"));
    const source = slots.find((el) => /Mana Potion|Goblin Ear|Warband Horn|Slab Chip/i.test(el.getAttribute("aria-label") ?? ""));
    const target = document.querySelector<HTMLElement>("canvas");
    if (!source || !target) throw new Error("missing source/target");
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForFunction((prev) => {
    const s = window.__VIBEAGE_VITE_E2E__?.getState();
    return (s?.groundLootIds?.length ?? 0) > prev;
  }, beforeLoot, { timeout: 8_000 });
});

test("prod a/a: drag bag slot to skill-bar slot binds item", async ({ page }) => {
  await openBagWithAnyItem(page);
  await page.evaluate(() => {
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".inventory-slot:not([disabled])"));
    const source = slots.find((el) => /Mana Potion|Goblin Ear|Warband Horn|Slab Chip/i.test(el.getAttribute("aria-label") ?? ""));
    const target = document.querySelectorAll<HTMLElement>(".skill-bar-slot")[7]; // empty knight slot
    if (!source || !target) throw new Error("missing source/target");
    const dt = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  const boundSlot = page.locator(".skill-button--item").first();
  await expect(boundSlot).toBeVisible({ timeout: 3_000 });
});

test("prod a/a: passive class skills do not appear in the shortcut bar", async ({ page }) => {
  await loginAndEnterWorld(page);
  await expect(page.locator(".skill-button")).not.toHaveCount(0);
  await expect(page.locator(".skill-button__name", { hasText: /Arcane Focus/i })).toHaveCount(0);
});
