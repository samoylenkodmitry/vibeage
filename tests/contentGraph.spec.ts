import { describe, expect, it } from 'vitest';
import {
  formatContentGraphIssues,
  validateContentGraph,
} from '../packages/content/obtainability';

/**
 * PR HH — content-graph validator. Walks every spec registry and
 * fails CI when an item, mob, or NPC is unreachable from the game,
 * or when one record references another by an id that doesn't exist.
 *
 * One test per failure mode so a single broken record produces a
 * targeted diff in the CI log rather than a single mega-failure
 * that swamps the rest.
 */
describe('content graph', () => {
  const issues = validateContentGraph();
  const byKind = (kind: (typeof issues)[number]['kind']) => issues.filter((i) => i.kind === kind);

  it('has no hanging items (every ITEMS entry is sold / dropped / crafted / quest-rewarded)', () => {
    const hanging = byKind('hanging-item');
    expect(hanging, formatContentGraphIssues(hanging)).toEqual([]);
  });

  it('has no hanging mobs (every ENEMY_TEMPLATES entry is referenced by a zone spawn)', () => {
    const hanging = byKind('hanging-mob');
    expect(hanging, formatContentGraphIssues(hanging)).toEqual([]);
  });

  it('has no hanging NPCs (every QUEST_NPCS entry is referenced by a quest or vendor)', () => {
    const hanging = byKind('hanging-npc');
    expect(hanging, formatContentGraphIssues(hanging)).toEqual([]);
  });

  it('every spec id reference resolves to an actual record', () => {
    const unknown = issues.filter((i) =>
      i.kind === 'unknown-item'
      || i.kind === 'unknown-mob'
      || i.kind === 'unknown-npc'
      || i.kind === 'unknown-boss',
    );
    expect(unknown, formatContentGraphIssues(unknown)).toEqual([]);
  });
});
