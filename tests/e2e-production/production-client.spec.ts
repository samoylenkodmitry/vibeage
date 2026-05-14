import { expect, type Page, test } from "@playwright/test";

async function enterWorld(page: Page, playerName: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Character Name").fill(playerName);
  await page.getByRole("button", { name: "Enter the World" }).click();
  await expect(page.getByText("Online")).toBeVisible({ timeout: 25_000 });
  await page.waitForFunction(() => Boolean(window.__VIBEAGE_VITE_E2E__?.getState().myPlayerId));
  await page.waitForFunction(() => {
    return (window.__VIBEAGE_VITE_E2E__?.getState().enemyIds.length ?? 0) > 0;
  });
}

test("production client can enter, move, target, cast, and relog", async ({ page }) => {
  const playerName = `ProdSmoke${Date.now()}`;
  await enterWorld(page, playerName);

  const initialPosition = await page.evaluate(() => {
    return window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition ?? null;
  });

  const target = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.moveNearPlayer());
  expect(target).toBeTruthy();
  await page.waitForFunction((previous) => {
    const current = window.__VIBEAGE_VITE_E2E__?.getState().lastKnownPlayerPosition;
    if (!current || !previous) {
      return false;
    }

    return Math.abs(current.x - previous.x) + Math.abs(current.z - previous.z) > 0.01;
  }, initialPosition);

  const selectedEnemyId = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.selectFirstEnemy());
  expect(selectedEnemyId).toBeTruthy();
  await page.getByRole("button", { name: "Cast Fireball" }).click();
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    return Boolean(state?.castSkillIds.includes("fireball") || state?.liveProjectileSkillIds.includes("fireball"));
  });

  await page.reload();
  await enterWorld(page, playerName);
  const relogState = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.getState());
  expect(relogState?.myPlayerId).toBeTruthy();
  expect(relogState?.playerVitals?.isAlive).toBe(true);
});
