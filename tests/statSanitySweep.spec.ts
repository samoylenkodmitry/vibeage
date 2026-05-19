import { describe, expect, it } from 'vitest';
import type { CharacterClass } from '../packages/content/classes';
import { CHARACTER_RACES, type CharacterRace } from '../packages/content/races';
import {
  CLASS_AUTO_PASSIVE_SKILL,
  CLASS_LEARNABLE_PASSIVE_SKILLS,
  PASSIVE_SKILL_CONTRIBUTIONS,
} from '../packages/content/classPassives';
import type { SkillId } from '../packages/content/skills';
import {
  buildContributions,
  computeAllStats,
  type StatPlayerView,
  type StatId,
} from '../packages/sim/statContributions';

/**
 * PR PP — sanity sweep. Walk every race × class × level combo plus
 * a few loadout fixtures and assert the stat math holds together.
 * Pinning these invariants stops a future content drop from silently
 * inverting class HP or wiping race-specific attrs.
 *
 * Run with `VERBOSE=1 pnpm test statSanitySweep` to dump a tabular
 * snapshot you can eyeball.
 */
const CLASSES: CharacterClass[] = ['mage', 'warrior', 'healer', 'ranger', 'knight', 'paladin', 'rogue'];
const LEVELS = [1, 10, 20, 40];
const ATTR_IDS: readonly StatId[] = ['str', 'dex', 'con', 'int', 'wit', 'men'];
const VERBOSE = process.env.VERBOSE === '1';

function freshUnlockedSkills(className: CharacterClass): SkillId[] {
  const auto = CLASS_AUTO_PASSIVE_SKILL[className];
  return auto ? [auto] : [];
}

function statsFor(opts: {
  level: number;
  className: CharacterClass;
  race: CharacterRace;
  unlockedSkills?: readonly SkillId[];
  equippedTemplates?: StatPlayerView['equippedTemplates'];
}) {
  const view: StatPlayerView = {
    level: opts.level,
    className: opts.className,
    race: opts.race,
    unlockedSkills: opts.unlockedSkills ?? freshUnlockedSkills(opts.className),
    equippedTemplates: opts.equippedTemplates,
  };
  return computeAllStats(buildContributions(view), {
    level: opts.level,
    className: opts.className,
    race: opts.race,
    health: 1,
    maxHealth: 1,
    hpFraction: 1,
  });
}

describe('stat sanity sweep', () => {
  it('STR/DEX/CON/INT/WIT/MEN depend only on race + level (identical across classes)', () => {
    for (const race of CHARACTER_RACES) {
      for (const level of LEVELS) {
        const baseline = statsFor({ level, className: CLASSES[0], race });
        for (const cls of CLASSES.slice(1)) {
          const other = statsFor({ level, className: cls, race });
          for (const attr of ATTR_IDS) {
            expect(other.totals[attr],
              `${race} lvl ${level} attr ${attr}: ${cls} differs from ${CLASSES[0]}`,
            ).toBe(baseline.totals[attr]);
          }
        }
      }
    }
  });

  it('every derived total is positive', () => {
    for (const race of CHARACTER_RACES) {
      for (const cls of CLASSES) {
        for (const level of LEVELS) {
          const { totals } = statsFor({ level, className: cls, race });
          for (const stat of Object.keys(totals) as StatId[]) {
            expect(totals[stat],
              `${race} ${cls} lvl ${level}: ${stat} should be > 0`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('caps honoured: castSpeed ≥ 0.4, runSpeed ≥ 2, hpRegen ≥ 1, mpRegen ≥ 1', () => {
    for (const race of CHARACTER_RACES) {
      for (const cls of CLASSES) {
        for (const level of LEVELS) {
          const { totals } = statsFor({ level, className: cls, race });
          expect(totals.castSpeed).toBeGreaterThanOrEqual(0.4);
          expect(totals.runSpeed).toBeGreaterThanOrEqual(2);
          expect(totals.hpRegen).toBeGreaterThanOrEqual(1);
          expect(totals.mpRegen).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('each learnable passive emits a contribution row on the affected stat', () => {
    // Integer rounding can swallow a 5% mul on small stats, so we
    // can't reliably check totals.before vs totals.after. The right
    // check is structural: does the passive's contribution show up
    // on the breakdown when the player has the passive learned?
    for (const cls of CLASSES) {
      for (const passive of CLASS_LEARNABLE_PASSIVE_SKILLS[cls]) {
        const expectedRows = PASSIVE_SKILL_CONTRIBUTIONS[passive];
        expect(expectedRows, `${passive} should have at least one contribution`).toBeTruthy();
        const result = statsFor({
          level: 40, className: cls, race: 'human',
          unlockedSkills: [...freshUnlockedSkills(cls), passive],
        });
        for (const expected of expectedRows) {
          const found = result.breakdown[expected.stat]?.parts.find((p) => p.source === expected.source);
          expect(found,
            `${cls}/${passive}: contribution row missing on ${expected.stat}`,
          ).toBeTruthy();
          expect(found?.op).toBe(expected.op);
        }
      }
    }
  });

  if (VERBOSE) {
    it('tabular dump (VERBOSE=1)', () => {
      const rows: string[] = [];
      rows.push(
        ['race', 'class', 'lvl', 'str', 'dex', 'pAtk', 'mAtk', 'maxHP', 'maxMP', 'dmgMult', 'runSpd']
          .map((s) => s.padStart(8)).join(' | '),
      );
      for (const race of CHARACTER_RACES) {
        for (const cls of CLASSES) {
          for (const level of LEVELS) {
            const { totals } = statsFor({ level, className: cls, race });
            rows.push(
              [race, cls, String(level),
                String(totals.str), String(totals.dex),
                String(totals.pAtk), String(totals.mAtk),
                String(totals.maxHealth), String(totals.maxMana),
                totals.dmgMult.toFixed(2), String(totals.runSpeed),
              ].map((s) => String(s).padStart(8)).join(' | '),
            );
          }
        }
      }
      // Tabular dump for visual review; only emitted when VERBOSE=1.
      process.stdout.write('\n' + rows.join('\n') + '\n');
      expect(rows.length).toBeGreaterThan(0);
    });
  }
});
