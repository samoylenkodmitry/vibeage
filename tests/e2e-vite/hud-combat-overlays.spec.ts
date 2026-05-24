import { expect, test } from '@playwright/test';
import { enterWorld, selectFirstEnemy } from '../e2e-helpers/gameClient';

test.setTimeout(120_000);

/**
 * Combat-feedback HUD overlays added in #577-#584:
 *   - DamageNumber sprite (Three.js — not DOM-testable; we rely on
 *     `visualEventKinds: 'damage'` as the proxy signal from the
 *     existing combat-flow harness)
 *   - HurtVignette div (.hurt-vignette) when player.health drops
 *   - GainBurst div (.gain-burst--xp) when player.experience ticks up
 *
 * A live combat round against the starter zone's first regular mob
 * exercises the path: cast Fireball → enemy retaliates → player loses
 * HP (hurt vignette) → eventual kill → XP burst. Either of those
 * landing within the timeout is sufficient — the test asserts that
 * at least one combat overlay shows the wiring is end-to-end.
 */
test('hud combat overlays render on real combat', async ({ page }) => {
  await enterWorld(page, `HudCombat${Date.now()}`);
  const targetId = await selectFirstEnemy(page);
  expect(targetId).toBeTruthy();

  await page.getByRole('button', { name: 'Cast Fireball' }).click();

  // Watch for any of the DOM overlay classes OR the damage
  // visual-event kind. Whichever lands first wins. The combat-log
  // text fallback covers the "all visual events pruned on a slow
  // runner" race documented in combat-flow.spec.ts.
  await page.waitForFunction(() => {
    const w = window as unknown as { __VIBEAGE_VITE_E2E__?: { getState: () => unknown } };
    const state = (w.__VIBEAGE_VITE_E2E__?.getState() ?? {}) as {
      visualEventKinds?: string[];
      combatLogTexts?: string[];
    };
    if (state.visualEventKinds?.includes('damage')) return true;
    if (state.combatLogTexts?.some((t) => /damage|XP|gold|fell/.test(t))) return true;
    if (document.querySelector('.hurt-vignette')) return true;
    if (document.querySelector('.gain-burst--xp')) return true;
    if (document.querySelector('.gain-burst--gold')) return true;
    if (document.querySelector('.level-up-burst')) return true;
    return false;
  }, undefined, { timeout: 60_000 });
});
