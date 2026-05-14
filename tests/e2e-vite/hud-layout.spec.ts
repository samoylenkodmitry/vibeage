import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorld, movePlayerNear } from "../e2e-helpers/gameClient";

test.setTimeout(60_000);

const HUD_VIEWPORTS = [
  { name: "desktop", size: { width: 1280, height: 720 }, inventoryVisible: true },
  { name: "mobile", size: { width: 390, height: 844 }, inventoryVisible: false },
] as const;

for (const viewport of HUD_VIEWPORTS) {
  test(`keeps core HUD panels inside the ${viewport.name} viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport.size);
    await enterWorld(page, `Hud${viewport.name}${Date.now()}`);
    await movePlayerNear(page, { x: 6, z: -4 });

    const panels = [
      page.getByRole("region", { name: "Connection" }),
      page.getByRole("region", { name: "World status" }),
      page.getByRole("region", { name: "Player status" }),
      page.getByRole("region", { name: "Target" }),
      page.getByRole("region", { name: "Starter progress" }),
      page.getByRole("region", { name: "Movement" }),
      page.getByRole("region", { name: "Skills" }),
    ];

    if (viewport.inventoryVisible) {
      panels.push(page.getByRole("region", { name: "Inventory" }));
    } else {
      await expect(page.getByRole("region", { name: "Inventory" })).toBeHidden();
    }

    for (const panel of panels) {
      await expect(panel).toBeVisible();
    }

    await expectInsideViewport(page, panels);
    await expectSkillButtonsFit(page);
    await page.screenshot({
      path: testInfo.outputPath(`${viewport.name}-hud.png`),
      animations: "disabled",
      fullPage: false,
    });
  });
}

async function expectInsideViewport(page: Page, locators: Locator[]): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  for (const locator of locators) {
    const box = await locator.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  }
}

async function expectSkillButtonsFit(page: Page): Promise<void> {
  const overflowCount = await page.locator(".skill-button").evaluateAll((buttons) => {
    return buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).length;
  });

  expect(overflowCount).toBe(0);
}
