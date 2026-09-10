import { describe, expect, it } from 'vitest';
import { ITEMS, getItemGrade } from '../packages/content/items';
import { getGradeSpec } from '../packages/content/equipmentTypes';
import {
  bestLootRank, lighten, lootTierForRank, lootTreatment, type LootTier,
} from '../apps/client/src/lootRarity';

/**
 * Rarity treatment for ground loot.
 *
 * Everything on the marker — ring, sparks, beam, label, glow — is driven from
 * these bands, so a band that slips one step turns a farmed field into a light
 * show or hides the one drop worth walking to. The boundaries are the contract.
 */

/** First item id in the content with the given grade, so the tests read real data. */
function itemWithGrade(grade: 'none' | 'd' | 'c' | 'b' | 'a' | 's'): string {
  const found = Object.values(ITEMS).find((item) => getItemGrade(item) === grade);
  if (!found) throw new Error(`content has no ${grade}-grade item to test with`);
  return found.id;
}

const LOUDEST_TO_QUIETEST: readonly LootTier[] = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

describe('lootTierForRank', () => {
  it('maps every equipment grade to its band', () => {
    expect(lootTierForRank(getGradeSpec('s').rank)).toBe('legendary');
    expect(lootTierForRank(getGradeSpec('a').rank)).toBe('epic');
    expect(lootTierForRank(getGradeSpec('b').rank)).toBe('rare');
    // D and C are both early filler — one band keeps them from shouting.
    expect(lootTierForRank(getGradeSpec('c').rank)).toBe('uncommon');
    expect(lootTierForRank(getGradeSpec('d').rank)).toBe('uncommon');
    expect(lootTierForRank(getGradeSpec('none').rank)).toBe('common');
  });

  it('never promotes an unrecognised drop', () => {
    // -1 is "no known item in the stack"; guessing legendary there would fire a
    // beam over a pile of vendor trash.
    expect(lootTierForRank(-1)).toBe('common');
    expect(lootTierForRank(Number.NaN)).toBe('common');
  });
});

describe('bestLootRank', () => {
  it('takes the best item in a mixed stack, not the first', () => {
    const junk = itemWithGrade('none');
    const prize = itemWithGrade('s');
    expect(bestLootRank([{ itemId: junk }, { itemId: prize }]))
      .toBe(getGradeSpec('s').rank);
  });

  it('ignores ids the client cannot resolve', () => {
    expect(bestLootRank([{ itemId: 'not_a_real_item' }])).toBe(-1);
    expect(bestLootRank([])).toBe(-1);
  });
});

describe('lootTreatment', () => {
  it('gets louder in every dimension as the grade climbs', () => {
    const tiers = LOUDEST_TO_QUIETEST.map((tier) => ({
      tier,
      style: lootTreatment([{ itemId: itemWithGrade(gradeForTier(tier)) }]),
    }));
    for (let i = 1; i < tiers.length; i += 1) {
      const louder = tiers[i - 1].style;
      const quieter = tiers[i].style;
      expect(louder.scale).toBeGreaterThan(quieter.scale);
      expect(louder.labelRange).toBeGreaterThan(quieter.labelRange);
      expect(louder.glowIntensity).toBeGreaterThan(quieter.glowIntensity);
      // A rare pile must outbid a common one for one of the pooled lights.
      expect(louder.glowPriority).toBeGreaterThan(quieter.glowPriority);
    }
  });

  it('keeps a common drop quiet and an epic-and-up drop loud', () => {
    const common = lootTreatment([{ itemId: itemWithGrade('none') }]);
    expect(common.beam).toBe(false);
    expect(common.pulseRate).toBe(0);
    expect(common.scale).toBeLessThan(1);
    // A farmed field is answered from ~9m, not from across the zone.
    expect(common.labelRange).toBeLessThan(10);

    for (const grade of ['a', 's'] as const) {
      const loud = lootTreatment([{ itemId: itemWithGrade(grade) }]);
      expect(loud.beam).toBe(true);
      expect(loud.pulseRate).toBeGreaterThan(0);
      // Readable from further than the player can see a box: that's the point.
      expect(loud.labelRange).toBeGreaterThan(30);
    }
  });

  it('carries the grade colour through ring, sparks and label', () => {
    const treatment = lootTreatment([{ itemId: itemWithGrade('s') }]);
    expect(treatment.color).toBe(getGradeSpec('s').color);
    // Sparks and label are tints of the same hue, never the old hardcoded gold.
    expect(treatment.sparkColor).not.toBe(treatment.color);
    expect(treatment.labelColor).not.toBe(treatment.color);
    expect(treatment.sparkColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(treatment.labelColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('falls back to the neutral no-grade colour for unknown ids', () => {
    const treatment = lootTreatment([{ itemId: 'not_a_real_item' }]);
    expect(treatment.tier).toBe('common');
    expect(treatment.color).toBe(getGradeSpec('none').color);
  });
});

describe('lighten', () => {
  it('moves a colour toward white without leaving hex', () => {
    expect(lighten('#000000', 0)).toBe('#000000');
    expect(lighten('#000000', 1)).toBe('#ffffff');
    expect(lighten('#808080', 0.5)).toBe('#c0c0c0');
  });

  it('passes non-hex input through untouched', () => {
    expect(lighten('rebeccapurple', 0.5)).toBe('rebeccapurple');
  });
});

function gradeForTier(tier: LootTier): 'none' | 'd' | 'b' | 'a' | 's' {
  switch (tier) {
    case 'legendary': return 's';
    case 'epic': return 'a';
    case 'rare': return 'b';
    case 'uncommon': return 'd';
    default: return 'none';
  }
}
