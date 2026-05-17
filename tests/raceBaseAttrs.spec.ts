import { describe, expect, it } from 'vitest';
import { derivePlayerStats } from '../packages/sim/playerStats';
import { RACE_PROFILES } from '../packages/content/races';

/**
 * Architecture invariant (user-driven refactor): race owns the six
 * base attributes (STR/DEX/CON/INT/WIT/MEN). Class no longer touches
 * them — class differentiation moves to the `baseStats` damage/HP/MP
 * multipliers (interim) and to passive skills (planned, see ROADMAP
 * Section 8 L520).
 */

describe('race owns base attributes (class does not)', () => {
  it('same race + same level → identical STR/DEX/CON/INT/WIT/MEN across classes', () => {
    const orcWarrior = derivePlayerStats(10, 'warrior', {}, 'orc');
    const orcMage = derivePlayerStats(10, 'mage', {}, 'orc');
    const orcRogue = derivePlayerStats(10, 'rogue', {}, 'orc');

    for (const stat of ['str', 'dex', 'con', 'int', 'wit', 'men'] as const) {
      expect(orcWarrior[stat], `${stat} should be race-driven`).toBe(orcMage[stat]);
      expect(orcMage[stat], `${stat} should be race-driven`).toBe(orcRogue[stat]);
    }
  });

  it('different race + same class → different base attributes', () => {
    const orcMage = derivePlayerStats(10, 'mage', {}, 'orc');
    const darkElfMage = derivePlayerStats(10, 'mage', {}, 'dark_elf');

    // Orc starts with STR 17, dark_elf 13. Both grow per-level; gap
    // persists (it actually widens since orc growth is also higher).
    expect(orcMage.str).toBeGreaterThan(darkElfMage.str);
    // Dark_elf has INT 17 base + 1.9/level growth; orc has INT 10 base.
    expect(darkElfMage.int).toBeGreaterThan(orcMage.int);
  });

  it('per-race level-1 attrs match RACE_PROFILES.baseAttrs (no class skew)', () => {
    for (const profile of Object.values(RACE_PROFILES)) {
      // Test every class to assert the per-class skew is gone.
      for (const className of ['warrior', 'mage', 'healer'] as const) {
        const stats = derivePlayerStats(1, className, {}, profile.race);
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
    const orcStr1 = derivePlayerStats(1, 'warrior', {}, 'orc').str;
    const orcStr11 = derivePlayerStats(11, 'warrior', {}, 'orc').str;
    // 10 level-ups × growth (orc=2.0/lvl) = 20 STR gained.
    expect(orcStr11 - orcStr1).toBe(Math.floor(10 * RACE_PROFILES.orc.growthPerLevel.str));
  });
});
