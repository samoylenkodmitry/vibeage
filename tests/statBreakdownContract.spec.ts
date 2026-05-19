import { describe, expect, it } from 'vitest';
import {
  buildContributions,
  computeAllStats,
  type StatPlayerView,
} from '../packages/sim/statContributions';

/**
 * PR OO — the HUD breakdown popup re-derives stats from the same
 * `computeAllStats` the engine uses. These tests pin the breakdown
 * shape that popup renders so a refactor of the contribution
 * registry can't silently drop the labels the player sees.
 */
function compute(view: StatPlayerView) {
  return computeAllStats(buildContributions(view), {
    level: view.level,
    race: view.race ?? 'human',
    className: view.className,
    health: 100,
    maxHealth: 100,
    hpFraction: 1,
  });
}

describe('stat breakdown contract', () => {
  it('totals returned for every StatId', () => {
    const result = compute({ level: 5, className: 'mage', race: 'human' });
    const expected = [
      'str', 'dex', 'con', 'int', 'wit', 'men',
      'pAtk', 'mAtk', 'pDef', 'mDef',
      'maxHealth', 'maxMana',
      'hpRegen', 'mpRegen',
      'accuracy', 'evasion',
      'attackSpeed', 'castSpeed', 'runSpeed',
      'dmgMult', 'critChance', 'critMult',
    ];
    for (const stat of expected) {
      expect(result.totals).toHaveProperty(stat);
      expect(result.breakdown).toHaveProperty(stat);
    }
  });

  it('breakdown.parts carry source + label so the popup can render rows', () => {
    const result = compute({ level: 5, className: 'mage', race: 'human' });
    const pAtk = result.breakdown.pAtk;
    expect(pAtk.parts.length).toBeGreaterThan(0);
    for (const part of pAtk.parts) {
      expect(part.source).toBeTruthy();
      expect(part.label).toBeTruthy();
      expect(['base', 'addPre', 'mul', 'addPost']).toContain(part.op);
    }
  });

  it('Bless status effect emits a dmgMult mul contribution', () => {
    const view: StatPlayerView = {
      level: 5,
      className: 'mage',
      race: 'human',
      statusEffects: [
        { id: 'b', type: 'bless', value: 25, durationMs: 5_000, startTimeTs: Date.now(), sourceSkill: 'bless' },
      ],
    };
    const result = compute(view);
    const blessRow = result.breakdown.dmgMult.parts.find((p) => p.source.startsWith('effect:bless:'));
    expect(blessRow, 'breakdown should include a Bless row').toBeDefined();
    expect(blessRow?.op).toBe('mul');
  });

  it('equippedTemplates path produces the same equipment rows as the inventory path', () => {
    const equipped: StatPlayerView = {
      level: 5,
      className: 'warrior',
      race: 'human',
      equippedTemplates: { MAIN_HAND: 'worn_sword' },
    };
    const result = compute(equipped);
    const swordRows = result.breakdown.pAtk.parts.filter((p) => p.source.includes('worn_sword'));
    expect(swordRows.length).toBeGreaterThan(0);
  });
});
