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
  await expect(page.getByRole("button", { name: /show bag/i })).toBeVisible();
});

test("sends movement through the Vite client action path", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const target = await movePlayerNear(page);
  expect(target).toBeTruthy();
});

test("keeps the selected target when issuing movement", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const selectedEnemyId = await selectFirstEnemy(page);
  expect(selectedEnemyId).toBeTruthy();
  await movePlayerNear(page, { x: 5, z: -3 });

  const state = await page.evaluate(() => window.__VIBEAGE_VITE_E2E__?.getState() ?? null);
  expect(state?.selectedTargetId).toBe(selectedEnemyId);
});

test("casts fireball from the Vite skill bar path", async ({ page }) => {
  await enterWorld(page, `Vite${Date.now()}`);

  const selectedEnemyId = await selectFirstEnemy(page);
  expect(selectedEnemyId).toBeTruthy();
  await castFireballFromSkillBar(page);
});
