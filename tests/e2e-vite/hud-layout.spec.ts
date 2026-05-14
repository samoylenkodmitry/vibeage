import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorld } from "../e2e-helpers/gameClient";

test.setTimeout(60_000);

const HUD_VIEWPORTS = [
  { name: "desktop", size: { width: 1280, height: 720 }, inventoryVisible: true },
  { name: "mobile", size: { width: 390, height: 844 }, inventoryVisible: false },
] as const;

for (const viewport of HUD_VIEWPORTS) {
  test(`keeps core HUD panels inside the ${viewport.name} viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport.size);
    await enterWorld(page, `Hud${viewport.name}${Date.now()}`);
    await showMovementPanel(page);

    const panels = [
      panel("Connection", page.locator(".hud-top")),
      panel("World status", page.locator(".hud-stats")),
      panel("Player status", page.locator(".player-panel")),
      panel("Target", page.locator(".hud-target")),
      panel("Starter progress", page.locator(".starter-progress")),
      panel("Movement", page.locator(".movement-panel")),
      panel("Skills", page.locator(".skill-bar")),
    ];

    if (viewport.inventoryVisible) {
      panels.push(panel("Inventory", page.locator(".inventory-panel")));
    } else {
      await expect(page.locator(".inventory-panel")).toBeHidden();
    }

    for (const panel of panels) {
      await expect(panel.locator, panel.name).toBeVisible();
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

type HudPanel = {
  name: string;
  locator: Locator;
};

function panel(name: string, locator: Locator): HudPanel {
  return { name, locator };
}

async function showMovementPanel(page: Page): Promise<void> {
  const target = await page.evaluate(() => {
    return window.__VIBEAGE_VITE_E2E__?.moveNearPlayer({ x: 6, z: -4 }) ?? null;
  });

  expect(target).toBeTruthy();
  await expect(page.locator(".movement-panel")).toBeVisible();
}

async function expectInsideViewport(page: Page, panels: HudPanel[]): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  for (const { name, locator } of panels) {
    const box = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    });

    expect(box.x, `${name} x`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${name} y`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${name} right edge`).toBeLessThanOrEqual(viewport!.width + 1);
    expect(box.y + box.height, `${name} bottom edge`).toBeLessThanOrEqual(viewport!.height + 1);
  }
}

async function expectSkillButtonsFit(page: Page): Promise<void> {
  const overflowCount = await page.locator(".skill-button").evaluateAll((buttons) => {
    return buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).length;
  });

  expect(overflowCount).toBe(0);
}
