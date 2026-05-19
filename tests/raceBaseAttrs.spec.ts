import { describe, expect, it } from 'vitest';
import { RACE_PROFILES, type CharacterRace } from '../packages/content/races';
import type { CharacterClass } from '../packages/content/classes';
import {
  buildContributions,
  computeAllStats,
  type StatPlayerView,
} from '../packages/sim/statContributions';

/**
 * Architecture invariant (user-driven refactor): race owns the six
 * base attributes (STR/DEX/CON/INT/WIT/MEN). Class no longer touches
 * them — class differentiation moves to passive class multipliers
 * (damageMultiplier / healthMultiplier / manaMultiplier / speedMultiplier)
 * folded into derived stats via the Contribution registry. The
 * per-race attribute parity below is enforced by `computeAllStats`
 * reading RACE_PROFILES.baseAttrs.
 */
function statsFor(level: number, className: CharacterClass, race: CharacterRace) {
  const view: StatPlayerView = { level, className, race };
  return computeAllStats(buildContributions(view), { level, className, race, health: 1, maxHealth: 1 }).totals;
}

describe('race owns base attributes (class does not)', () => {
  it('same race + same level → identical STR/DEX/CON/INT/WIT/MEN across classes', () => {
    const orcWarrior = statsFor(10, 'warrior', 'orc');
    const orcMage = statsFor(10, 'mage', 'orc');
    const orcRogue = statsFor(10, 'rogue', 'orc');

    for (const stat of ['str', 'dex', 'con', 'int', 'wit', 'men'] as const) {
      expect(orcWarrior[stat], `${stat} should be race-driven`).toBe(orcMage[stat]);
      expect(orcMage[stat], `${stat} should be race-driven`).toBe(orcRogue[stat]);
    }
  });

  it('different race + same class → different base attributes', () => {
    const orcMage = statsFor(10, 'mage', 'orc');
    const darkElfMage = statsFor(10, 'mage', 'dark_elf');
    expect(orcMage.str).toBeGreaterThan(darkElfMage.str);
    expect(darkElfMage.int).toBeGreaterThan(orcMage.int);
  });

  it('per-race level-1 attrs match RACE_PROFILES.baseAttrs (no class skew)', () => {
    for (const profile of Object.values(RACE_PROFILES)) {
      for (const className of ['warrior', 'mage', 'healer'] as const) {
        const stats = statsFor(1, className, profile.race);
        expect(stats.str, `${profile.race}/${className} STR at level 1`).toBe(profile.baseAttrs.str);
        expect(stats.dex, `${profile.race}/${className} DEX at level 1`).toBe(profile.baseAttrs.dex);
        expect(stats.con, `${profile.race}/${className} CON at level 1`).toBe(profile.baseAttrs.con);
        expect(stats.int, `${profile.race}/${className} INT at level 1`).toBe(profile.baseAttrs.int);
        expect(stats.wit, `${profile.race}/${className} WIT at level 1`).toBe(profile.baseAttrs.wit);
        expect(stats.men, `${profile.race}/${className} MEN at level 1`).toBe(profile.baseAttrs.men);
      }
    }
  });

  it('per-level growth matches RACE_PROFILES.growthPerLevel (no class skew)', () => {
    const orcStr1 = statsFor(1, 'warrior', 'orc').str;
    const orcStr11 = statsFor(11, 'warrior', 'orc').str;
    expect(orcStr11 - orcStr1).toBe(Math.floor(10 * RACE_PROFILES.orc.growthPerLevel.str));
  });
});
