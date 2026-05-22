import { expect, test } from "@playwright/test";
import {
  enterWorld,
  getClientState,
  selectFirstEnemy,
} from "../e2e-helpers/gameClient";

test.setTimeout(120_000);

/**
 * Full combat flow from the player's UI POV. The existing single-button
 * test in `vite-client.spec.ts` is the canary; this file covers the
 * shape "user picks a target, clicks a skill / basic attack, the
 * server actually acks and the cast lands". Regression net for the
 * §52 cast-pipeline rollout (CommandRejected + clientSeq) — a schema
 * mismatch in #329 silently dropped every CastReq on the server side
 * with no visible UX feedback; the basic-method tests in
 * `tests/combat.castHandler.spec.ts` passed because they imported the
 * TS types directly and never went through Zod parsing. This file is
 * the boundary that catches that class of bug.
 */

test('skill bar Fireball button: full cast + damage flow', async ({ page }) => {
  await enterWorld(page, `CombatFlow${Date.now()}`);

  const targetId = await selectFirstEnemy(page);
  expect(targetId).toBeTruthy();

  // Snapshot the targeted enemy's starting HP so we can prove the
  // cast actually landed (server damage applied).
  const startHealth = await page.evaluate((id) => {
    // The e2e hook doesn't expose the full enemy record, so peek
    // at the client visual state directly.
    const w = window as unknown as { __VIBEAGE_VITE_E2E__?: { getState: () => unknown } };
    return (w.__VIBEAGE_VITE_E2E__?.getState() as { enemyIds: string[] })?.enemyIds.includes(id) ? 1 : 0;
  }, targetId);
  expect(startHealth).toBe(1);

  await page.getByRole('button', { name: 'Cast Fireball' }).click();

  // Phase 1: the client picks up the cast — either immediately (in
  // range) or after the queued approach + arrival path. Either way
  // a CastSnapshot for fireball should arrive within the cast wait.
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    return Boolean(
      state?.castSkillIds.includes('fireball')
      || state?.liveProjectileSkillIds.includes('fireball'),
    );
  }, undefined, { timeout: 60_000 });

  // Phase 2: cast actually reaches the impact phase and any damage
  // is applied. `visualEventKinds` carries the damage popups the
  // client renders on enemy hit; if the cast was silently rejected
  // (schema mismatch, validation gate) we'd see neither. The OR on
  // `combatLogTexts` covers the slow-CI-runner race: visual events
  // are pruned ~1.8 s after they fire, so on a slow runner the
  // window between Phase 1 finishing and Phase 2 starting can miss
  // the popup entirely even though the cast landed. The combat-log
  // entry ("Fireball hit X for N damage") persists in the 200-line
  // ring buffer and is the canonical proof that damage was applied
  // server-side.
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    if (!state) return false;
    if ((state.visualEventKinds ?? []).includes('damage')) return true;
    return (state.combatLogTexts ?? []).some((text) => /Fireball hit /.test(text));
  }, undefined, { timeout: 30_000 });
});

test('skill bar Basic Attack button: cast snapshot lands', async ({ page }) => {
  await enterWorld(page, `BasicAttack${Date.now()}`);

  const targetId = await selectFirstEnemy(page);
  expect(targetId).toBeTruthy();

  // Basic Attack lives on the dedicated `.skill-bar-anchor` row above
  // the F-key grid. The button's aria-label is "Cast Attack" (the
  // SKILLS['basicAttack'].name is "Attack").
  await page.getByRole('button', { name: 'Cast Attack' }).click();

  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    if (!state) return false;
    if (state.castSkillIds.includes('basicAttack')) return true;
    if ((state.visualEventKinds ?? []).includes('damage')) return true;
    // Persistent combat-log fallback (same fix as the Fireball test
    // in #448). castSkillIds + visualEventKinds both have short
    // ttls (3 s / 1.8 s); on the slow GitHub runner the
    // approach-and-cast path can resolve before the test starts
    // polling, leaving the auto-attack hit visible only in the
    // 200-line combat log.
    return (state.combatLogTexts ?? []).some((text) => / hit /.test(text));
  }, undefined, { timeout: 60_000 });
});

test('CastReq is never silently dropped — server always acks one way or the other', async ({ page }) => {
  await enterWorld(page, `CastAck${Date.now()}`);

  const targetId = await selectFirstEnemy(page);
  expect(targetId).toBeTruthy();

  await page.getByRole('button', { name: 'Cast Fireball' }).click();

  // The server must produce *something* observable in client state
  // within a generous timeout — either a CastSnapshot (success) or
  // any change to cast/damage/visual events. The bug we're guarding
  // against is the "schema strict-rejects, message dropped, zero
  // server-side response" path that PR #329 introduced and which
  // the unit-level cast tests couldn't catch because they bypassed
  // the Zod parser.
  await page.waitForFunction(() => {
    const state = window.__VIBEAGE_VITE_E2E__?.getState();
    if (!state) return false;
    return state.castSkillIds.length > 0
      || state.liveProjectileSkillIds.length > 0
      || (state.visualEventKinds ?? []).length > 0
      || state.connectionState !== 'online';
  }, undefined, { timeout: 60_000 });

  // And the connection should still be online — a silent drop +
  // disconnect is a different class of bug we'd want to flag.
  const finalState = await getClientState(page);
  expect(finalState?.connectionState).toBe('online');
});
