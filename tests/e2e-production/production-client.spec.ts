import { expect, test } from "@playwright/test";
import {
  castFireballFromSkillBar,
  ensurePlayerAlive,
  enterWorld,
  getClientState,
  movePlayerNear,
  selectFirstEnemy,
} from "../e2e-helpers/gameClient";

test("production client can enter, move, target, cast, and relog", async ({ page }) => {
  const playerName = `ProdSmoke${Date.now()}`;
  await enterWorld(page, playerName);

  const target = await movePlayerNear(page);
  expect(target).toBeTruthy();
  const selectedEnemyId = await selectFirstEnemy(page);
  expect(selectedEnemyId).toBeTruthy();
  await castFireballFromSkillBar(page);
  await ensurePlayerAlive(page);

  await page.reload();
  await enterWorld(page, playerName);
  await ensurePlayerAlive(page);
  const relogState = await getClientState(page);
  expect(relogState?.myPlayerId).toBeTruthy();
  expect(relogState?.playerVitals?.isAlive).toBe(true);
});
