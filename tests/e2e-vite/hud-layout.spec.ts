import { expect, test, type Locator, type Page } from "@playwright/test";
import { enterWorld } from "../e2e-helpers/gameClient";

test.setTimeout(90_000);

const HUD_VIEWPORTS = [
  {
    name: "desktop",
    size: { width: 1280, height: 720 },
    inventoryVisible: true,
    infoPanelsVisible: true,
    minWorldVisibilityRatio: 0.55,
  },
  {
    name: "mobile",
    size: { width: 390, height: 844 },
    inventoryVisible: true,
    infoPanelsVisible: false,
    minWorldVisibilityRatio: 0.55,
  },
] as const;

for (const viewport of HUD_VIEWPORTS) {
  test(`keeps core HUD panels inside the ${viewport.name} viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport.size);
    await enterWorld(page, `Hud${viewport.name}${Date.now()}`);
    await issueMoveIntent(page, viewport.infoPanelsVisible);

    const panels = [
      panel("Connection", page.locator(".hud-top")),
      panel("Player status", page.locator(".player-panel")),
      panel("Target", page.locator(".hud-target")),
      panel("Skills", page.locator(".skill-bar")),
    ];

    if (viewport.infoPanelsVisible) {
      panels.push(
        panel("World status", page.locator(".hud-stats")),
        panel("Starter progress", page.locator(".starter-progress")),
        panel("Movement", page.locator(".movement-panel")),
        panel("Navigation", page.locator(".navigation-panel")),
      );
    } else {
      await expect(page.locator(".hud-stats")).toBeHidden();
      await expect(page.locator(".navigation-panel")).toBeHidden();
      await expect(page.locator(".movement-panel")).toBeHidden();
    }

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
    await expectWorldVisible(page, panels, viewport.minWorldVisibilityRatio);
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

async function issueMoveIntent(page: Page, expectMovementPanelVisible: boolean): Promise<void> {
  const target = await page.evaluate(() => {
    return window.__VIBEAGE_VITE_E2E__?.moveNearPlayer({ x: 6, z: -4 }) ?? null;
  });

  expect(target).toBeTruthy();
  if (expectMovementPanelVisible) {
    await expect(page.locator(".movement-panel")).toBeVisible();
  }
}

type PanelBox = { name: string; x: number; y: number; width: number; height: number };

async function measurePanels(page: Page, panels: HudPanel[]): Promise<PanelBox[]> {
  const selectors = panels.map(({ name, locator }) => ({ name, selector: locatorSelector(locator) }));
  return await page.evaluate((items) => {
    return items.map(({ name, selector }) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return {
        name,
        x: rect?.x ?? 0,
        y: rect?.y ?? 0,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      };
    });
  }, selectors);
}

function locatorSelector(locator: Locator): string {
  const description = locator.toString();
  const match = description.match(/locator\('([^']+)'\)/);
  if (!match) {
    throw new Error(`Cannot extract selector from locator: ${description}`);
  }
  return match[1];
}

async function expectInsideViewport(page: Page, panels: HudPanel[]): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();

  const boxes = await measurePanels(page, panels);
  for (const box of boxes) {
    expect(box.x, `${box.name} x`).toBeGreaterThanOrEqual(0);
    expect(box.y, `${box.name} y`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${box.name} right edge`).toBeLessThanOrEqual(viewport!.width + 1);
    expect(box.y + box.height, `${box.name} bottom edge`).toBeLessThanOrEqual(viewport!.height + 1);
  }
}

async function expectSkillButtonsFit(page: Page): Promise<void> {
  const overflowCount = await page.locator(".skill-button").evaluateAll((buttons) => {
    return buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).length;
  });

  expect(overflowCount).toBe(0);
}

async function expectWorldVisible(
  page: Page,
  panels: HudPanel[],
  minRatio: number,
): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  const totalArea = viewport!.width * viewport!.height;

  const boxes = await measurePanels(page, panels);
  const coveredArea = computeUnionArea(boxes, viewport!.width, viewport!.height);
  const visibleRatio = Math.max(0, 1 - coveredArea / totalArea);
  expect(
    visibleRatio,
    `world visibility ratio. Boxes: ${JSON.stringify(boxes.map((box) => ({
      name: box.name,
      area: Math.round(Math.max(0, box.width) * Math.max(0, box.height)),
    })))}`,
  ).toBeGreaterThanOrEqual(minRatio);
}

function computeUnionArea(
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  vpWidth: number,
  vpHeight: number,
): number {
  if (boxes.length === 0) {
    return 0;
  }
  const sampleStep = 4;
  const cols = Math.ceil(vpWidth / sampleStep);
  const rows = Math.ceil(vpHeight / sampleStep);
  const cells = new Uint8Array(cols * rows);
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x / sampleStep));
    const y0 = Math.max(0, Math.floor(box.y / sampleStep));
    const x1 = Math.min(cols, Math.ceil((box.x + box.width) / sampleStep));
    const y1 = Math.min(rows, Math.ceil((box.y + box.height) / sampleStep));
    for (let row = y0; row < y1; row += 1) {
      for (let col = x0; col < x1; col += 1) {
        cells[row * cols + col] = 1;
      }
    }
  }
  let count = 0;
  for (const cell of cells) {
    count += cell;
  }
  return count * sampleStep * sampleStep;
}
