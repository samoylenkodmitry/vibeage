import { describe, expect, it, vi } from 'vitest';
import { meetsQuestPrerequisites, QUESTS, type QuestDef } from '../packages/content/quests';
import { applyAcceptQuest } from '../server/players/playerQuests';
import { createTransientPlayer } from '../server/playerFactory';
import { QUEST_NPCS } from '../packages/content/npcs';
import type { OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

// §49/M6 PR029 — quest prerequisites. Verifies the predicate +
// the server-side gate so a player can't accept a follow-up quest
// before the prerequisite quest is completed.

function makePlayerNearGalen(): PlayerState {
  const player = createTransientPlayer('quest-prereq-socket', 'Tester');
  const galen = QUEST_NPCS.warden_galen;
  player.position = { x: galen.position.x, y: galen.position.y, z: galen.position.z };
  player.questState = { active: {}, completed: [] };
  return player;
}

describe('meetsQuestPrerequisites', () => {
  const baseQuest: QuestDef = {
    id: 'follow_up', name: 'Follow-up', description: '',
    npcId: 'warden_galen', minLevel: 1,
    stages: [{ id: 's1', description: '', objective: { kind: 'manual', description: '' } }],
    reward: {},
  };

  it('returns true when no prerequisites declared', () => {
    expect(meetsQuestPrerequisites(baseQuest, { completedQuests: [] })).toBe(true);
  });

  it('returns true when every prereq quest is in completedQuests', () => {
    const quest: QuestDef = { ...baseQuest, prerequisites: { completedQuests: ['rats_in_the_cellar'] } };
    expect(meetsQuestPrerequisites(quest, { completedQuests: ['rats_in_the_cellar'] })).toBe(true);
  });

  it('returns false when any prereq is missing', () => {
    const quest: QuestDef = { ...baseQuest, prerequisites: { completedQuests: ['rats_in_the_cellar', 'scout_the_road'] } };
    expect(meetsQuestPrerequisites(quest, { completedQuests: ['rats_in_the_cellar'] })).toBe(false);
  });

  it('returns true when prereq list is empty', () => {
    const quest: QuestDef = { ...baseQuest, prerequisites: { completedQuests: [] } };
    expect(meetsQuestPrerequisites(quest, { completedQuests: [] })).toBe(true);
  });
});

describe('applyAcceptQuest gates on prerequisites', () => {
  it('rejects acceptance when prereq quest not completed', () => {
    const player = makePlayerNearGalen();
    // Patch in a synthetic quest with a prereq so we don't need to
    // mutate authored content. (QUESTS is mutated for the test then
    // restored in afterEach below.)
    QUESTS.test_with_prereq = {
      id: 'test_with_prereq', name: 'Prereq Test', description: '',
      npcId: 'warden_galen', minLevel: 1,
      stages: [{ id: 's1', description: '', objective: { kind: 'manual', description: '' } }],
      reward: {},
      prerequisites: { completedQuests: ['rats_in_the_cellar'] },
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    const ok = applyAcceptQuest(player, 'test_with_prereq', outbound, Date.now());

    expect(ok).toBe(false);
    expect(player.questState?.active.test_with_prereq).toBeUndefined();

    delete QUESTS.test_with_prereq;
  });

  it('accepts when prereq quest IS completed', () => {
    const player = makePlayerNearGalen();
    player.questState = { active: {}, completed: ['rats_in_the_cellar'] };
    QUESTS.test_with_prereq = {
      id: 'test_with_prereq', name: 'Prereq Test', description: '',
      npcId: 'warden_galen', minLevel: 1,
      stages: [{ id: 's1', description: '', objective: { kind: 'manual', description: '' } }],
      reward: {},
      prerequisites: { completedQuests: ['rats_in_the_cellar'] },
    };
    const outbound: OutboundEventSink = { publish: vi.fn() };

    const ok = applyAcceptQuest(player, 'test_with_prereq', outbound, Date.now());

    expect(ok).toBe(true);
    expect(player.questState?.active.test_with_prereq).toEqual({ stageIndex: 0, progress: 0 });

    delete QUESTS.test_with_prereq;
  });
});
