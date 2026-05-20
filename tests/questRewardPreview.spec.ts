import { describe, expect, it } from 'vitest';
import { formatRewardSummary } from '../apps/client/src/hud/NpcDialog';
import { QUESTS } from '../packages/content/quests';
import { ITEMS } from '../packages/content/items';

// §49/M6 — quest reward preview. NPC dialog shows what the player
// gets before they accept. Tests pin XP / gold / item ordering +
// item id → display name resolution.

describe('formatRewardSummary', () => {
  it('renders xp + gold + items in order, separated by commas', () => {
    expect(formatRewardSummary({
      xp: 120, gold: 25,
      items: [{ itemId: 'health_potion', quantity: 2 }],
    })).toBe(`120 XP, 25g, 2× ${ITEMS.health_potion.name}`);
  });

  it('omits xp/gold when 0/undefined', () => {
    expect(formatRewardSummary({ items: [{ itemId: 'health_potion' }] }))
      .toBe(ITEMS.health_potion.name);
  });

  it('elides quantity prefix when grant is 1', () => {
    expect(formatRewardSummary({ xp: 50, items: [{ itemId: 'health_potion', quantity: 1 }] }))
      .toBe(`50 XP, ${ITEMS.health_potion.name}`);
  });

  it('falls back to the item id when the template is missing', () => {
    expect(formatRewardSummary({ items: [{ itemId: 'not_a_real_item', quantity: 3 }] }))
      .toBe('3× not_a_real_item');
  });

  it('returns "" when the reward bag is empty', () => {
    expect(formatRewardSummary({})).toBe('');
  });

  it('renders the rats_in_the_cellar starter quest preview correctly', () => {
    const summary = formatRewardSummary(QUESTS.rats_in_the_cellar.reward);
    expect(summary).toContain('120 XP');
    expect(summary).toContain('25g');
    expect(summary).toContain(ITEMS.health_potion.name);
  });
});
