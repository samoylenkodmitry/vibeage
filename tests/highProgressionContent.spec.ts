import { describe, expect, it } from 'vitest';
import { ENEMY_TEMPLATES } from '../packages/content/enemies';
import { EQUIPMENT_SETS } from '../packages/content/equipmentSets';
import { ITEMS } from '../packages/content/items';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { QUEST_NPCS } from '../packages/content/npcs';
import { getItemSources } from '../packages/content/obtainability';
import { QUESTS, type QuestDef } from '../packages/content/quests';
import { VENDORS } from '../packages/content/vendors';

const HIGH_PROGRESSION_QUEST_IDS = [
  'sunspire_firebreak',
  'moonfall_star_chart',
  'marsh_silence_pact',
  'zero_hour_breach',
] as const;

const PROGRESSION_SET_IDS = ['roadwarden_kit', 'horizon_watch'] as const;

describe('level 31-40 progression content', () => {
  it('adds unique quest NPCs, unique quest mobs, reach objectives, and gear rewards', () => {
    const baselineNpcIds = new Set<string>();
    const baselineMobTypes = new Set<string>();
    const questIds = new Set<string>(HIGH_PROGRESSION_QUEST_IDS);

    for (const quest of Object.values(QUESTS)) {
      if (!questIds.has(quest.id)) collectQuestReferences(quest, baselineNpcIds, baselineMobTypes);
    }

    const usedNewMobs = new Set<string>();
    for (const questId of HIGH_PROGRESSION_QUEST_IDS) {
      const quest = QUESTS[questId];
      expect(quest, `quest ${questId} should exist`).toBeDefined();
      if (!quest) throw new Error(`missing high progression quest: ${questId}`);

      expect(quest.minLevel, questId).toBeGreaterThanOrEqual(31);
      expect(quest.minLevel, questId).toBeLessThanOrEqual(40);
      expect(QUEST_NPCS[quest.npcId], `${questId} giver`).toBeDefined();
      expect(baselineNpcIds.has(quest.npcId), `${quest.npcId} should be unique to high progression beats`).toBe(false);
      expect(quest.stages.some((stage) => stage.objective.kind === 'reach'), `${questId} should create a map objective beat`).toBe(true);
      expect((quest.reward.items ?? []).some((grant) => ITEMS[grant.itemId]?.equip), `${questId} should grant gear`).toBe(true);

      for (const stage of quest.stages) {
        const objective = stage.objective;
        if (objective.kind !== 'kill') continue;
        expect(ENEMY_TEMPLATES[objective.enemyType], `${objective.enemyType} template`).toBeDefined();
        expect(baselineMobTypes.has(objective.enemyType), `${objective.enemyType} should not reuse older quest mobs`).toBe(false);
        expect(usedNewMobs.has(objective.enemyType), `${objective.enemyType} should be used by one high quest`).toBe(false);
        usedNewMobs.add(objective.enemyType);
      }
    }
  });

  it('sources every progression set piece from quests or the frontier quartermaster', () => {
    const quartermaster = VENDORS.frontier_quartermaster;
    expect(quartermaster).toBeDefined();
    expect(quartermaster.npcId).toBe('frontier_quartermaster_vane');

    for (const setId of PROGRESSION_SET_IDS) {
      const set = EQUIPMENT_SETS[setId];
      expect(set, `${setId} set`).toBeDefined();
      const grades = new Set(set.requiredPieces.map((itemId) => ITEMS[itemId]?.grade));
      expect(grades.size, `${setId} should stay one grade`).toBe(1);
      for (const itemId of set.requiredPieces) {
        const item = ITEMS[itemId];
        expect(item?.setId, `${itemId} setId`).toBe(setId);
        const sources = getItemSources(itemId);
        expect(
          sources.some((source) => source.kind === 'quest' || source.kind === 'vendor'),
          `${itemId} should have a deterministic source`,
        ).toBe(true);
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
