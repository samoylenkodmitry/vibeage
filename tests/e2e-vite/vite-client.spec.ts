import { expect, test } from "@playwright/test";
import {
  castFireballFromSkillBar,
  enterWorld,
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
  await expect(page.getByRole("region", { name: "Starter progress" })).toContainText("Starter Path");
  await expect(page.getByRole("region", { name: "Inventory" })).toBeVisible();
});

test("sends movement through the Vite client action path", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const target = await movePlayerNear(page);
  expect(target).toBeTruthy();
});

test("casts fireball from the Vite skill bar path", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const selectedEnemyId = await selectFirstEnemy(page);
  expect(selectedEnemyId).toBeTruthy();
  await castFireballFromSkillBar(page);
});
