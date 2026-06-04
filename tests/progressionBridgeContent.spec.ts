import { describe, expect, it } from 'vitest';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';
import { ITEMS } from '../packages/content/items';
import { QUEST_NPCS } from '../packages/content/npcs';
import { QUESTS, type QuestDef } from '../packages/content/quests';

const BRIDGE_QUEST_IDS = [
  'frontier_orders',
  'thornroad_pickets',
  'brightglass_detour',
  'moonroad_signal',
  'frontier_cutover',
] as const;

describe('level 20-31 progression bridge content', () => {
  it('uses a new guide NPC, unique quest mobs, map objectives, and deterministic gear beats', () => {
    const baselineNpcIds = new Set<string>();
    const baselineMobTypes = new Set<string>();
    const questIds = new Set<string>(BRIDGE_QUEST_IDS);

    for (const quest of Object.values(QUESTS)) {
      if (!questIds.has(quest.id)) collectQuestReferences(quest, baselineNpcIds, baselineMobTypes);
    }

    const usedBridgeMobs = new Set<string>();
    for (const questId of BRIDGE_QUEST_IDS) {
      const quest = QUESTS[questId];
      expect(quest, `quest ${questId} should exist`).toBeDefined();
      if (!quest) throw new Error(`missing progression bridge quest: ${questId}`);

      expect(quest.minLevel, questId).toBeGreaterThanOrEqual(20);
      expect(quest.minLevel, questId).toBeLessThanOrEqual(30);
      expect(quest.npcId, questId).toBe('roadwarden_saila');
      expect(QUEST_NPCS[quest.npcId], `${questId} giver`).toBeDefined();
      expect(baselineNpcIds.has(quest.npcId), `${quest.npcId} should be unique to bridge content`).toBe(false);
      expect(quest.stages.some((stage) => stage.objective.kind === 'reach'), `${questId} should create a map objective beat`).toBe(true);

      if (questId !== 'frontier_orders') {
        expect((quest.reward.items ?? []).some((grant) => ITEMS[grant.itemId]?.equip), `${questId} should grant gear`).toBe(true);
      }

      for (const stage of quest.stages) {
        const objective = stage.objective;
        if (objective.kind !== 'kill') continue;
        expect(ENEMY_TEMPLATES[objective.enemyType], `${objective.enemyType} template`).toBeDefined();
        expect(baselineMobTypes.has(objective.enemyType), `${objective.enemyType} should not reuse older quest mobs`).toBe(false);
        expect(usedBridgeMobs.has(objective.enemyType), `${objective.enemyType} should be used by one bridge quest`).toBe(false);
        usedBridgeMobs.add(objective.enemyType);
      }
    }

    expect(usedBridgeMobs.size).toBe(8);
  });
});

function collectQuestReferences(quest: QuestDef, npcIds: Set<string>, mobTypes: Set<string>): void {
  npcIds.add(quest.npcId);
  for (const stage of quest.stages) {
    const objective = stage.objective;
    if (objective.kind === 'talk') npcIds.add(objective.npcId);
    if (objective.kind === 'kill') mobTypes.add(objective.enemyType);
  }
}
