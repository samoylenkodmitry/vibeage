import { describe, expect, it } from 'vitest';
import { MINI_BOSSES } from '../packages/content/miniBosses';
import { QUESTS, type QuestDef } from '../packages/content/quests';
import { runPlayerJourney } from '../server/sim/playerJourney';

const BRIDGE_QUEST_IDS = [
  'ash_in_the_gears',
  'frostbound_stock',
  'quiet_trophies',
] as const;

const EXPECTED_BRIDGE_NPCS = [
  'general_goods_thala',
  'tinker_drev',
  'trophy_buyer_oren',
];

const EXPECTED_BRIDGE_MOBS = [
  'ethereal_sprite',
  'flame_wraith',
  'frost_wolf',
  'ice_elemental',
  'spirit_guardian',
  'void_spawner',
];

describe('level 17-19 quest bridge content isolation', () => {
  it('uses only NPCs and mob types that no other quest already uses', () => {
    const bridgeIds = new Set<string>(BRIDGE_QUEST_IDS);
    const baselineNpcIds = new Set<string>();
    const baselineMobTypes = new Set<string>();

    for (const quest of Object.values(QUESTS)) {
      if (bridgeIds.has(quest.id)) continue;
      collectQuestReferences(quest, baselineNpcIds, baselineMobTypes);
    }

    const bridgeNpcIds = new Map<string, Set<string>>();
    const bridgeMobTypes = new Map<string, Set<string>>();

    for (const questId of BRIDGE_QUEST_IDS) {
      const quest = QUESTS[questId];
      expect(quest, `quest ${questId} should exist`).toBeDefined();
      if (!quest) throw new Error(`missing bridge quest: ${questId}`);

      expect(quest.minLevel).toBeGreaterThanOrEqual(17);
      expect(quest.minLevel).toBeLessThan(20);
      expect(baselineNpcIds.has(quest.npcId), `quest giver ${quest.npcId} is already used by another quest`).toBe(false);
      addBridgeRef(bridgeNpcIds, quest.npcId, quest.id);

      for (const stage of quest.stages) {
        const objective = stage.objective;
        if (objective.kind === 'talk') {
          expect(baselineNpcIds.has(objective.npcId), `talk NPC ${objective.npcId} is already used by another quest`).toBe(false);
          addBridgeRef(bridgeNpcIds, objective.npcId, quest.id);
        }
        if (objective.kind === 'kill') {
          expect(baselineMobTypes.has(objective.enemyType), `mob ${objective.enemyType} is already used by another quest`).toBe(false);
          addBridgeRef(bridgeMobTypes, objective.enemyType, quest.id);
        }
        expect(objective.kind, 'bridge quests should stay on regular unused mobs, not named bosses').not.toBe('kill_boss');
      }
    }

    expect([...bridgeNpcIds.keys()].sort()).toEqual(EXPECTED_BRIDGE_NPCS);
    expect([...bridgeMobTypes.keys()].sort()).toEqual(EXPECTED_BRIDGE_MOBS);

    for (const [npcId, questIds] of bridgeNpcIds) {
      expect(questIds.size, `NPC ${npcId} is used by more than one bridge quest`).toBe(1);
    }
    for (const [mobType, questIds] of bridgeMobTypes) {
      expect(questIds.size, `mob ${mobType} is used by more than one bridge quest`).toBe(1);
    }
  });

  it('is completed by the deterministic journey route before specialization', () => {
    const summary = runPlayerJourney({ className: 'mage', specializationId: 'arcanist', horizonHours: 168 });
    const choosePathIndex = summary.questIdsCompleted.indexOf('choose_your_path');

    expect(choosePathIndex).toBeGreaterThanOrEqual(0);
    for (const questId of BRIDGE_QUEST_IDS) {
      const bridgeIndex = summary.questIdsCompleted.indexOf(questId);
      expect(bridgeIndex, `journey should complete ${questId}`).toBeGreaterThanOrEqual(0);
      expect(bridgeIndex, `${questId} should complete before the specialization quest`).toBeLessThan(choosePathIndex);
    }
  });
});

function collectQuestReferences(
  quest: QuestDef,
  npcIds: Set<string>,
  mobTypes: Set<string>,
): void {
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

function addBridgeRef(refs: Map<string, Set<string>>, refId: string, questId: string): void {
  const questIds = refs.get(refId) ?? new Set<string>();
  questIds.add(questId);
  refs.set(refId, questIds);
}
