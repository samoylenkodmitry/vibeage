import { describe, expect, test } from 'vitest';
import { CLASS_AUTO_PASSIVE_SKILL } from '../packages/content/classPassives';
import {
  buildContributions,
  computeAllStats,
  type StatPlayerView,
} from '../packages/sim/statContributions';

// PR SS — spec passives feed the Contribution pipeline. Picking
// Arcanist at L20 should land as named rows (dmgMult ×1.15, maxMana
// ×1.10); proficiency at L40 should stack a second maxMana row.

function buildView(level: number, specializationId?: string): StatPlayerView {
  return {
    level,
    className: 'mage',
    race: 'human',
    unlockedSkills: [CLASS_AUTO_PASSIVE_SKILL.mage],
    specializationId,
  };
}

describe('spec passive → Contribution rows', () => {
  test('below spec-unlock level: no spec rows', () => {
    const rows = buildContributions(buildView(19, 'arcanist'));
    expect(rows.find((r) => r.source.startsWith('spec:'))).toBeUndefined();
  });

  test('at L20 with arcanist: spec passive emits named mul rows and lifts totals', () => {
    const view = buildView(20, 'arcanist');
    const rows = buildContributions(view);
    const specRows = rows.filter((r) => r.source.startsWith('spec:arcanist:spec'));
    expect(specRows.map((r) => r.stat).sort()).toEqual(['dmgMult', 'maxMana']);
    expect(specRows.every((r) => r.op === 'mul')).toBe(true);
    expect(specRows.find((r) => r.stat === 'dmgMult')?.value).toBe(1.15);
    expect(specRows.find((r) => r.stat === 'maxMana')?.value).toBe(1.10);

    const totals = computeAllStats(rows, { level: 20, className: 'mage', race: 'human', health: 1, maxHealth: 1 }).totals;
    const noSpec = computeAllStats(buildContributions(buildView(20)), { level: 20, className: 'mage', race: 'human', health: 1, maxHealth: 1 }).totals;
    expect(totals.dmgMult).toBeGreaterThan(noSpec.dmgMult);
    expect(totals.maxMana).toBeGreaterThan(noSpec.maxMana);
  });

  test('at L40 with arcanist: proficiency passive stacks a second mana row', () => {
    const rows = buildContributions(buildView(40, 'arcanist'));
    const profRows = rows.filter((r) => r.source.startsWith('spec:arcanist:prof'));
    expect(profRows.map((r) => r.stat)).toEqual(['maxMana']);
    expect(profRows[0]?.value).toBe(1.15);

    const totals = computeAllStats(rows, { level: 40, className: 'mage', race: 'human', health: 1, maxHealth: 1 }).totals;
    const specOnly = computeAllStats(
      buildContributions(buildView(39, 'arcanist')),
      { level: 39, className: 'mage', race: 'human', health: 1, maxHealth: 1 },
    ).totals;
    expect(totals.maxMana).toBeGreaterThan(specOnly.maxMana);
  });

  test('row label names the spec + passive so the popup reads sensibly', () => {
    const rows = buildContributions(buildView(20, 'arcanist'));
    const dmgRow = rows.find((r) => r.source === 'spec:arcanist:spec:dmg');
    expect(dmgRow?.label).toMatch(/arcane focus/i);
  });
});
