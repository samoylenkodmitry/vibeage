import { describe, expect, it } from 'vitest';
import {
  makeSimPlayer, makeSimEnemy, timeToKill, timeToDie, mainAttackFor,
} from '../server/sim/combatBalance';

/**
 * Regression bands for the combat-balance harness. These aren't a
 * balance *target* — they're guard rails: if a future combat change
 * makes a baseline fight trivial (TTK→0) or impossible (TTK→∞), or
 * breaks determinism, this fails and forces a deliberate look. The
 * harness's real job (cross-class/level report) is the script
 * `scripts/balance-report.ts`.
 */

describe('combat-balance harness — deterministic + sane bands', () => {
  it('a L10 warrior kills a level-matched goblin in a believable window', () => {
    const ttk = timeToKill(makeSimPlayer('warrior', 10), makeSimEnemy('goblin', 10), mainAttackFor('warrior'));
    expect(ttk.ttkMs).not.toBeNull();
    expect(ttk.ttkMs!).toBeGreaterThanOrEqual(0);
    expect(ttk.ttkMs!).toBeLessThan(30_000); // not a slog
    expect(ttk.hits).toBeGreaterThan(0);
  });

  it('is deterministic — identical inputs give identical TTK', () => {
    const a = timeToKill(makeSimPlayer('mage', 20), makeSimEnemy('goblin', 20), 'fireball');
    const b = timeToKill(makeSimPlayer('mage', 20), makeSimEnemy('goblin', 20), 'fireball');
    expect(a.ttkMs).toBe(b.ttkMs);
    expect(a.hits).toBe(b.hits);
  });

  it('every class can kill a level-matched goblin at L1, L20, L40 (offense never breaks)', () => {
    const classes = ['warrior', 'mage', 'rogue', 'ranger', 'healer', 'knight', 'paladin'] as const;
    for (const c of classes) {
      for (const lvl of [1, 20, 40]) {
        const ttk = timeToKill(makeSimPlayer(c, lvl), makeSimEnemy('goblin', lvl), mainAttackFor(c));
        expect(ttk.ttkMs, `${c} L${lvl} could not kill a level-matched goblin`).not.toBeNull();
      }
    }
  });

  it('timeToDie terminates (finite or a clean ∞), never hangs', () => {
    const res = timeToDie(makeSimPlayer('mage', 1), makeSimEnemy('goblin', 1));
    // ttdMs is either a finite death time or null (out-regened). Both are valid;
    // the assertion is just that the sim returned without hanging.
    expect(res.ttdMs === null || res.ttdMs >= 0).toBe(true);
  });
});
