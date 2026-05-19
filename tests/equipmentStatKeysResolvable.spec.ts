import { describe, expect, it } from 'vitest';
import { ITEMS } from '../packages/content/items';
import { EQUIPMENT_SETS } from '../packages/content/equipmentSets';
import { BOSS_GEAR_ITEMS, BOSS_GEAR_SETS } from '../packages/content/bossGear';
import { STATS } from '../packages/content/stats';

// §45 item 1 — every key in an item's stats block (or a set bonus's
// statModifiers) must either match a real STAT id or live in the
// content→engine alias map in packages/sim/statContributions.ts.
// Without this gate, content authors can ship a typo (or a legacy
// name) and the row is silently dropped at computeAllStats time.

const ALIAS = new Set(['hp', 'mp', 'critRate', 'moveSpeed']);

function isResolvableKey(key: string): boolean {
  return ALIAS.has(key) || Object.prototype.hasOwnProperty.call(STATS, key);
}

describe('equipment stat keys resolve to a real StatId', () => {
  it('every key in any ITEMS.stats is resolvable', () => {
    const offenders: string[] = [];
    for (const item of [...Object.values(ITEMS), ...Object.values(BOSS_GEAR_ITEMS)]) {
      if (!item.stats) continue;
      for (const key of Object.keys(item.stats)) {
        if (!isResolvableKey(key)) offenders.push(`${item.id}.${key}`);
      }
    }
    expect(offenders, `unknown stat keys: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every set bonus modifier key is resolvable', () => {
    const offenders: string[] = [];
    const sets = [...Object.values(EQUIPMENT_SETS), ...Object.values(BOSS_GEAR_SETS)];
    for (const set of sets) {
      for (const bonus of set.bonuses) {
        for (const key of Object.keys(bonus.statModifiers)) {
          if (!isResolvableKey(key)) offenders.push(`${set.setId}@${bonus.requiredCount}.${key}`);
        }
      }
    }
    expect(offenders, `unknown set-bonus keys: ${offenders.join(', ')}`).toEqual([]);
  });
});

// Regression: shipping equipment with `hp` now actually feeds the
// `maxHealth` stat rather than disappearing into the cast at
// pushItemStatBlock. Compares totals with vs. without a real
// boss-gear piece that uses every legacy key.
describe('legacy stat key aliasing makes bonuses land on the right stat', () => {
  it('hp / mp / critRate / moveSpeed feed maxHealth / maxMana / critChance / runSpeed via the alias', async () => {
    const { buildContributions, computeAllStats } = await import('../packages/sim/statContributions');
    const baseView = {
      level: 1, className: 'warrior' as const, race: 'human' as const,
      unlockedSkills: [], equippedTemplates: {} as Record<string, string>,
    };
    const baseTotals = computeAllStats(
      buildContributions(baseView),
      { ...baseView, health: 1, maxHealth: 1 },
    ).totals;

    // Inject a fake item template into the registry so the test
    // doesn't depend on tuning numbers of any real boss drop.
    const { ITEMS } = await import('../packages/content/items');
    const FAKE_ID = '__alias_test_helm__';
    ITEMS[FAKE_ID] = {
      id: FAKE_ID, name: 'Test Helm', description: 'Alias test fixture',
      icon: '', stackable: false, type: 'armor',
      grade: 'a', weight: 1,
      stats: { hp: 100, mp: 50, critRate: 7, moveSpeed: 2 },
    };

    const withHelm = {
      ...baseView,
      equippedTemplates: { HEAD: FAKE_ID } as Record<string, string>,
    };
    const totals = computeAllStats(
      buildContributions(withHelm),
      { ...withHelm, health: 1, maxHealth: 1 },
    ).totals;

    delete ITEMS[FAKE_ID];

    // The deltas must show up on the engine-side stat ids, not the
    // legacy content-side names (which the StatId union doesn't
    // even include).
    expect(totals.maxHealth - baseTotals.maxHealth).toBe(100);
    expect(totals.maxMana - baseTotals.maxMana).toBe(50);
    expect(totals.critChance - baseTotals.critChance).toBe(7);
    expect(totals.runSpeed - baseTotals.runSpeed).toBe(2);
  });
});
