import { describe, expect, it } from 'vitest';
import { ITEMS } from '../packages/content/items';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { QUEST_NPCS } from '../packages/content/npcs';
import { QUESTS, type QuestDef } from '../packages/content/quests';

const MIDGAME_BEAT_QUEST_IDS = [
  'crystal_lattice_survey',
  'shadow_debt_ledger',
  'hourglass_field_notes',
] as const;

describe('level 20-30 quest beat content', () => {
  it('adds deterministic midgame quest beats with unique NPCs, mobs, and gear rewards', () => {
    const baselineNpcIds = new Set<string>();
    const baselineMobTypes = new Set<string>();
    const beatIds = new Set<string>(MIDGAME_BEAT_QUEST_IDS);

    for (const quest of Object.values(QUESTS)) {
      if (!beatIds.has(quest.id)) collectQuestReferences(quest, baselineNpcIds, baselineMobTypes);
    }

    for (const questId of MIDGAME_BEAT_QUEST_IDS) {
      const quest = QUESTS[questId];
      expect(quest, `quest ${questId} should exist`).toBeDefined();
      if (!quest) throw new Error(`missing midgame quest: ${questId}`);

      expect(quest.minLevel, questId).toBeGreaterThanOrEqual(20);
      expect(quest.minLevel, questId).toBeLessThanOrEqual(30);
      expect(QUEST_NPCS[quest.npcId], `${questId} giver`).toBeDefined();
      expect(baselineNpcIds.has(quest.npcId), `${quest.npcId} should be unique to midgame beats`).toBe(false);
      expect((quest.reward.items ?? []).some((grant) => ITEMS[grant.itemId]?.equip), `${questId} should grant an item upgrade beat`).toBe(true);

      for (const stage of quest.stages) {
        const objective = stage.objective;
        if (objective.kind === 'kill') {
          expect(baselineMobTypes.has(objective.enemyType), `${objective.enemyType} should not reuse older quest mobs`).toBe(false);
        }
      }
    }
  });
});

function collectQuestReferences(quest: QuestDef, npcIds: Set<string>, mobTypes: Set<string>): void {
  npcIds.add(quest.npcId);
  for (const stage of quest.stages) {
    const objective = stage.objective;
    if (objective.kind === 'talk') npcIds.add(objective.npcId);
    if (objective.kind === 'kill') mobTypes.add(objective.enemyType);
    if (objective.kind === 'kill_boss') {
      const boss = MINI_BOSSES[objective.bossId];
      if (boss) mobTypes.add(boss.mobType);
    }
  }
}
