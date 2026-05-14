import { expect, type Page, test } from "@playwright/test";

async function enterWorld(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Character Name").fill(`Vite${Date.now()}`);
  await page.getByRole("button", { name: "Enter the World" }).click();

  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("Online")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Cast Fireball" })).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__?.getState().myPlayerId));
  await page.waitForFunction(() => {
    return (window.__VIBEAGE_VITE_E2E__?.getState().enemyIds.length ?? 0) > 0;
  });
}

test("enters the real game through the Vite client", async ({ page }) => {
  await enterWorld(page);

  const state = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.getState());
  expect(state?.myPlayerId).toBeTruthy();
  expect(state?.enemyIds.length).toBeGreaterThan(0);
  expect(state?.playerVitals?.isAlive).toBe(true);
  await expect(page.getByLabel("Player status")).toContainText("XP");
  await expect(page.getByRole("region", { name: "Starter progress" })).toContainText("Starter Path");
  await expect(page.getByRole("region", { name: "Inventory" })).toBeVisible();
});

test("sends movement through the Vite client action path", async ({ page }) => {
  await enterWorld(page);

  const initialPosition = await page.evaluate(() => {
    return window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition ?? null;
  });

  const target = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.moveNearPlayer());
  expect(target).toBeTruthy();
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__?.getState().targetWorldPos));
  await page.waitForFunction((previous) => {
    const current = window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition;
    if (!current || !previous) {
      return false;
    }

    return Math.abs(current.x - previous.x) + Math.abs(current.z - previous.z) > 0.01;
  }, initialPosition);
});

test("casts fireball from the Vite skill bar path", async ({ page }) => {
  await enterWorld(page);

  const selectedEnemyId = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.selectFirstEnemy());
  expect(selectedEnemyId).toBeTruthy();

  await page.getByRole("button", { name: "Cast Fireball" }).click();
  await page.waitForFunction(() => {
    return window.__VIBEAGE_VITE_E2E__?.getState().castSkillIds.includes("fireball");
  });
});
