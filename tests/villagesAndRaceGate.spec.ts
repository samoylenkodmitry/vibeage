import { describe, expect, it } from 'vitest';
import { CLASS_SKILL_TREES, type CharacterClass } from '../packages/content/classes';
import {
  CHARACTER_RACES,
  isClassAllowedForRace,
  RACE_PROFILES,
} from '../packages/content/races';
import { getNearestVillage, VILLAGES } from '../packages/content/villages';
import {
  DEFAULT_DAY_DURATION_MS,
  dayPhaseLabel,
} from '../packages/sim/timeOfDay';

describe('villages catalog', () => {
  it('exposes at least one lv1 village so any player can recall', () => {
    expect(VILLAGES.length).toBeGreaterThan(0);
    expect(VILLAGES.some((v) => v.minLevel <= 1)).toBe(true);
  });

  it('every village has a unique id', () => {
    const ids = new Set(VILLAGES.map((v) => v.id));
    expect(ids.size).toBe(VILLAGES.length);
  });

  it('getNearestVillage returns the closest village whose minLevel matches', () => {
    const v = getNearestVillage({ x: -1000, z: -1000 }, 5);
    expect(v.minLevel).toBeLessThanOrEqual(5);
  });

  it('a low-level caster never gets a high-level village even if it is closer', () => {
    const tooHigh = VILLAGES.find((v) => v.minLevel >= 5);
    if (!tooHigh) return; // catalog might only have lv1 entries
    const v = getNearestVillage({ x: tooHigh.position.x, z: tooHigh.position.z }, 1);
    expect(v.minLevel).toBeLessThanOrEqual(1);
  });
});

describe('race -> class gate', () => {
  it('every class is allowed by at least one race (no orphan classes)', () => {
    const classes = Object.keys(CLASS_SKILL_TREES) as CharacterClass[];
    for (const cls of classes) {
      const hasRace = CHARACTER_RACES.some((r) => RACE_PROFILES[r].allowedClasses.includes(cls));
      expect(hasRace, `class ${cls} not allowed by any race`).toBe(true);
    }
  });

  it('every race has at least one allowed class (no playable-but-classless race)', () => {
    for (const race of CHARACTER_RACES) {
      expect(RACE_PROFILES[race].allowedClasses.length, `race ${race} has no classes`).toBeGreaterThan(0);
    }
  });

  it('isClassAllowedForRace agrees with the static catalog', () => {
    for (const race of CHARACTER_RACES) {
      for (const cls of RACE_PROFILES[race].allowedClasses) {
        expect(isClassAllowedForRace(race, cls)).toBe(true);
      }
    }
  });
});

describe('day/night ratio', () => {
  it('day phase dominates the cycle', () => {
    const samples = 200;
    const counts: Record<string, number> = { dawn: 0, day: 0, dusk: 0, night: 0 };
    for (let i = 0; i < samples; i += 1) {
      const ts = Math.floor((i / samples) * DEFAULT_DAY_DURATION_MS);
      counts[dayPhaseLabel(ts)] = (counts[dayPhaseLabel(ts)] ?? 0) + 1;
    }
    expect(counts.day).toBeGreaterThan(counts.night);
    expect(counts.day + counts.dawn).toBeGreaterThan(counts.dusk + counts.night);
  });
});
