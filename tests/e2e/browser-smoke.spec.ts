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

  expect(pageErrors).toEqual([]);
});
