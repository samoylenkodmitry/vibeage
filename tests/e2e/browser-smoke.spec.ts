import { expect, type Page, test } from "@playwright/test";

function collectFatalBrowserErrors(page: Page): string[] {
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(message.text());
    }
  });

  return pageErrors;
}

async function enterWorld(page: Page): Promise<string> {
  const playerName = `Codex${Date.now()}`;

  await page.goto("/");
  await page.getByLabel("Character Name").fill(playerName);
  await page.getByRole("button", { name: "Enter the World" }).click();

  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("Entering the world")).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText("Could not enter the world")).toHaveCount(0);
  await expect(page.getByText("This browser could not start WebGL")).toHaveCount(0);
  await expect(page.getByText("Online")).toBeVisible();
  await expect(page.getByText(new RegExp(`^${playerName} 1$`))).toBeVisible();
  await expect(page.getByRole("button", { name: "Skill Tree" })).toBeVisible();
  await page.waitForFunction(() => Boolean((window as any).__VIBEAGE_E2E__?.getState().myPlayerId));

  return playerName;
}

test("loads the browser entry screen without fatal errors", async ({ page }) => {
  const pageErrors = collectFatalBrowserErrors(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "VibeAge" })).toBeVisible();
  await expect(page.getByLabel("Character Name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter the World" })).toBeVisible();
  await expect(page.locator("main")).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test("enters the world and reaches the connected game HUD", async ({ page }) => {
  const pageErrors = collectFatalBrowserErrors(page);

  await enterWorld(page);

  expect(pageErrors).toEqual([]);
});

test("sends movement intent through the browser client", async ({ page }) => {
  const pageErrors = collectFatalBrowserErrors(page);

  await enterWorld(page);

  const initialPosition = await page.evaluate(() => {
    return (window as any).__VIBEAGE_E2E__?.getState().lastKnownPlayerPosition ?? null;
  });

  await page.evaluate(() => {
    (window as any).__VIBEAGE_E2E__?.sendMoveIntent({ x: 12, z: -8 });
  });

  await page.waitForFunction(() => Boolean((window as any).__VIBEAGE_E2E__?.getState().targetWorldPos));
  await page.waitForFunction((previous) => {
    const current = (window as any).__VIBEAGE_E2E__?.getState().lastKnownPlayerPosition;
    if (!current) {
      return false;
    }
    if (!previous) {
      return true;
    }
    return Math.abs(current.x - previous.x) + Math.abs(current.z - previous.z) > 0.01;
  }, initialPosition);

  expect(pageErrors).toEqual([]);
});

test("casts fireball through the hotkey path", async ({ page }) => {
  const pageErrors = collectFatalBrowserErrors(page);

  await enterWorld(page);
  await page.waitForFunction(() => ((window as any).__VIBEAGE_E2E__?.getState().enemyIds.length ?? 0) > 0);

  const selectedEnemyId = await page.evaluate(() => (window as any).__VIBEAGE_E2E__?.selectFirstEnemy());
  expect(selectedEnemyId).toBeTruthy();

  await page.keyboard.press("KeyQ");

  await page.waitForFunction(() => {
    const state = (window as any).__VIBEAGE_E2E__?.getState();
    return state?.liveProjectileSkillIds.includes("fireball");
  });

  expect(pageErrors).toEqual([]);
});
