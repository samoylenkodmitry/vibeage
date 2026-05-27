import { describe, expect, it } from 'vitest';
import { makeSimPlayer, makeSimEnemy, timeToKill, timeToDie, mainAttackFor } from '../server/sim/combatBalance';
import type { CharacterClass } from '../packages/content/classes';

/**
 * THE DEFINED BALANCE TARGET (measured on the faithful whole-fight
 * simulator). Unlike combatBalance.spec's loose "didn't break" guard
 * rails, these encode the intended shape of 1v1 combat so a future
 * change that quietly re-breaks it (e.g. reverting in-combat regen,
 * making players immortal to a level-matched mob again) fails CI.
 *
 * Target:
 *  1. Offence works everywhere — every class kills a level-matched
 *     goblin promptly (finite, ≤ 15s) at low / mid / cap.
 *  2. Mobs are a real threat — a level-matched goblin CAN bring down a
 *     purely-passive player in the early-to-mid game (finite TTD through
 *     L10), and is genuinely dangerous at L1 (≤ 60s). This is the fix
 *     for the "unkillable 1v1 from L5" finding: passive regen is
 *     suppressed under fire, so you can't stand still and out-heal a mob.
 *     (At cap a lone common mob is allowed to be trivial — that's the
 *     separate defence-curve question, deliberately out of this target.)
 */

const CLASSES: CharacterClass[] = ['warrior', 'mage', 'rogue', 'ranger', 'healer', 'knight', 'paladin'];

describe('combat balance — defined target', () => {
  it('every class kills a level-matched goblin promptly at L1 / L20 / L40', () => {
    for (const c of CLASSES) {
      for (const lvl of [1, 20, 40]) {
        const { ttkMs } = timeToKill(makeSimPlayer(c, lvl), makeSimEnemy('goblin', lvl), mainAttackFor(c));
        expect(ttkMs, `${c} L${lvl} cannot kill a level-matched goblin`).not.toBeNull();
        expect(ttkMs!, `${c} L${lvl} TTK ${ttkMs}ms outside (0, 15s]`).toBeGreaterThan(0);
        expect(ttkMs!, `${c} L${lvl} TTK ${ttkMs}ms too slow`).toBeLessThanOrEqual(15_000);
      }
    }
  });

  it('a level-matched goblin can kill a purely-passive player through L10', () => {
    for (const c of CLASSES) {
      for (const lvl of [1, 5, 10]) {
        const { ttdMs } = timeToDie(makeSimPlayer(c, lvl), makeSimEnemy('goblin', lvl));
        expect(ttdMs, `${c} L${lvl} is unkillable by a level-matched goblin (out-regens it)`).not.toBeNull();
      }
    }
  });

  it('low-level mobs are genuinely dangerous — a L1 goblin downs a passive L1 player within 60s', () => {
    for (const c of CLASSES) {
      const { ttdMs } = timeToDie(makeSimPlayer(c, 1), makeSimEnemy('goblin', 1));
      expect(ttdMs).not.toBeNull();
      expect(ttdMs!, `${c} L1 survives a goblin too long (${ttdMs}ms)`).toBeLessThanOrEqual(60_000);
    }
  });
});
