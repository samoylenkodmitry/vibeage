import { describe, expect, it } from 'vitest';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';
import { ITEMS } from '../packages/content/items';
import { QUEST_NPCS } from '../packages/content/npcs';
import { QUESTS } from '../packages/content/quests';
import { GAME_ZONES } from '../packages/content/zones';

/** Chain order is load-bearing: each entry gates the next one. */
const NIGHTBELL_CHAIN = [
  'the_silent_line',
  'saltglass_clappers',
  'the_drowned_bell',
  'the_borrowed_voice',
  'the_last_nightbell',
] as const;

/**
 * Levels that had no quest at all before the Nightbell Line. If a
 * future drop moves these gates, the quiet stretch comes back — so
 * the band, not the individual quest, is what this test locks.
 */
const PREVIOUSLY_QUIET_LEVELS = [32, 33, 36, 38, 39] as const;

describe('Nightbell Line endgame chain', () => {
  it('fills every level that had no quest between the frontier camps and the cap', () => {
    const gatedLevels = new Set(Object.values(QUESTS).map((quest) => quest.minLevel));

    for (const level of PREVIOUSLY_QUIET_LEVELS) {
      expect(gatedLevels.has(level), `L${level} should offer a quest`).toBe(true);
    }
    // The band this chain owns: every level from the first frontier camp
    // to the cap now hands the player something to go and do.
    for (let level = 31; level <= 40; level += 1) {
      expect(gatedLevels.has(level), `L${level} should offer a quest`).toBe(true);
    }
  });

  it('runs as one ordered prerequisite chain with rising level gates', () => {
    let previousLevel = 0;

    for (const [index, questId] of NIGHTBELL_CHAIN.entries()) {
      const quest = QUESTS[questId];
      expect(quest, `quest ${questId} should exist`).toBeDefined();
      if (!quest) throw new Error(`missing nightbell quest: ${questId}`);

      expect(quest.minLevel, questId).toBeGreaterThan(previousLevel);
      previousLevel = quest.minLevel;

      const expectedPrereq = index === 0 ? 'sunspire_firebreak' : NIGHTBELL_CHAIN[index - 1];
      expect(quest.prerequisites?.completedQuests, questId).toEqual([expectedPrereq]);
      expect(QUESTS[expectedPrereq], `${questId} prereq resolves`).toBeDefined();
    }
  });

  it('points the compass somewhere real and keeps every objective reachable', () => {
    for (const questId of NIGHTBELL_CHAIN) {
      const quest = QUESTS[questId]!;
      const giver = QUEST_NPCS[quest.npcId];
      expect(giver, `${questId} giver`).toBeDefined();
      if (!giver) throw new Error(`missing giver for ${questId}`);

      expect(quest.stages.length, questId).toBeGreaterThan(0);
      expect(quest.stages.some((stage) => stage.objective.kind === 'reach'), `${questId} map objective`).toBe(true);
      expect(quest.stages.at(-1)?.objective.kind, `${questId} ends at its giver`).toBe('talk');

      for (const stage of quest.stages) {
        const objective = stage.objective;
        if (objective.kind === 'kill') {
          expect(ENEMY_TEMPLATES[objective.enemyType], `${questId}:${objective.enemyType}`).toBeDefined();
          expect(spawningZonesFor(objective.enemyType).length, `${objective.enemyType} must spawn somewhere`).toBeGreaterThan(0);
        }
        if (objective.kind === 'talk') expect(QUEST_NPCS[objective.npcId], `${questId}:${objective.npcId}`).toBeDefined();
        if (objective.kind === 'reach') {
          // Markers sit inside the giver's own zone; the endgame route is
          // already 20+ hours of travel and this chain must not add a leg.
          expect(zoneContaining(stage.marker ?? objective.position), `${questId} marker zone`).toBe(zoneContaining(giver.position));
        }
      }
    }
  });

  it('rewards existing items inside the level gold budget and lands two set pieces', () => {
    const rewardedItemIds = new Set<string>();

    for (const questId of NIGHTBELL_CHAIN) {
      const quest = QUESTS[questId]!;
      expect(quest.reward.xp ?? 0, questId).toBeGreaterThan(0);
      // Same ceiling the economy budget audit enforces (MAX_QUEST_GOLD_RATIO).
      expect((quest.reward.gold ?? 0) / (250 + quest.minLevel * 120), questId).toBeLessThanOrEqual(1.75);

      for (const grant of quest.reward.items ?? []) {
        expect(ITEMS[grant.itemId], `${questId} rewards ${grant.itemId}`).toBeDefined();
        rewardedItemIds.add(grant.itemId);
      }
    }

    // Both endgame sets were vendor-only before this chain; finishing the
    // line now closes Roadwarden Kit and Horizon Watch through play.
    expect(rewardedItemIds.has('moonfall_cloak')).toBe(true);
    expect(rewardedItemIds.has('riftcall_gloves')).toBe(true);
  });
});

function spawningZonesFor(enemyType: string): string[] {
  return GAME_ZONES.filter((zone) => zone.mobs.some((mob) => mob.type === enemyType)).map((zone) => zone.id);
}

function zoneContaining(point: { x: number; z: number }): string | undefined {
  return GAME_ZONES.find((zone) => (
    Math.hypot(point.x - zone.position.x, point.z - zone.position.z) <= zone.radius
  ))?.id;
}
