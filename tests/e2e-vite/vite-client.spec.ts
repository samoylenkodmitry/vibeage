import { expect, test } from "@playwright/test";
import {
  castFireballFromSkillBar,
  enterWorld,
  expectSelectedTargetCleared,
  getClientState,
  movePlayerNear,
  selectFirstEnemy,
} from "../e2e-helpers/gameClient";

test("enters the real game through the Vite client", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const state = await getClientState(page);
  expect(state?.myPlayerId).toBeTruthy();
  expect(state?.enemyIds.length).toBeGreaterThan(0);
  expect(state?.playerVitals?.isAlive).toBe(true);
  await expect(page.getByLabel("Player status")).toContainText("XP");

  await page.getByRole("button", { name: /show quest/i }).click();
  await expect(page.getByRole("region", { name: "Starter progress" })).toContainText("Starter Path");

  await page.getByRole("button", { name: /show bag/i }).click();
  await expect(page.getByRole("region", { name: "Inventory" })).toBeVisible();
});

test("sends movement through the Vite client action path", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const target = await movePlayerNear(page);
  expect(target).toBeTruthy();
});

test("clears the selected target when issuing movement", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const selectedEnemyId = await selectFirstEnemy(page);
  expect(selectedEnemyId).toBeTruthy();
  await movePlayerNear(page, { x: 5, z: -3 });
  await expectSelectedTargetCleared(page);
});

test("casts fireball from the Vite skill bar path", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const selectedEnemyId = await selectFirstEnemy(page);
  expect(selectedEnemyId).toBeTruthy();
  await castFireballFromSkillBar(page);
});
