import { expect, test } from "@playwright/test";

test("loads the browser entry screen without fatal errors", async ({ page }) => {
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "VibeAge" })).toBeVisible();
  await expect(page.getByLabel("Character Name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter the World" })).toBeVisible();
  await expect(page.locator("main")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
