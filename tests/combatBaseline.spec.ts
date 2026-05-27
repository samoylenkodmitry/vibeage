import { describe, expect, it } from 'vitest';
import baseline from './fixtures/combatBaseline.json';
import { makeSimPlayer, makeSimEnemy, timeToKill, timeToDie, mainAttackFor } from '../server/sim/combatBalance';
import type { CharacterClass } from '../packages/content/classes';

/**
 * BEHAVIORAL PARITY BASELINE for the engine-abstraction rewrite
 * (docs/ENGINE_ABSTRACTION.md). `tests/fixtures/combatBaseline.json`
 * is a golden snapshot of the CURRENT engine's combat behaviour
 * (balance-sim TTK/TTD across class × level), captured before the
 * spec-driven rewrite. The rewritten engine must reproduce these
 * numbers — this test is the safety net that lets a live-game big-bang
 * land without a GPU playtest. If a change here is intentional,
 * regenerate the fixture and call it out in review.
 */

const CLASSES: CharacterClass[] = ['warrior', 'mage', 'rogue', 'ranger', 'healer', 'knight', 'paladin'];
const LEVELS = [1, 5, 10, 20, 40];

describe('combat behavioral parity (golden baseline)', () => {
  it('current engine matches the recorded baseline for every class × level', () => {
    const actual: Record<string, { ttkMs: number | null; hits: number; ttdMs: number | null; dodges: number }> = {};
    for (const c of CLASSES) {
      for (const lvl of LEVELS) {
        const k = timeToKill(makeSimPlayer(c, lvl), makeSimEnemy('goblin', lvl), mainAttackFor(c));
        const d = timeToDie(makeSimPlayer(c, lvl), makeSimEnemy('goblin', lvl));
        actual[`${c}-${lvl}`] = { ttkMs: k.ttkMs, hits: k.hits, ttdMs: d.ttdMs, dodges: d.dodges };
      }
    }
    expect(actual).toEqual(baseline);
  });
});
