import { describe, expect, it } from 'vitest';
import { formatDistance, isObjectiveMet, pickTrackedStage } from '../apps/client/src/hud/QuestTrackerStrip';
import { QUEST_NPCS } from '../packages/content/npcs';
import type { PlayerEntity } from '../apps/client/src/gameTypes';

// §49/M2 PR008 — heads-up quest tracker. Verifies the picker
// resolves the active quest's current stage + the right marker
// position so the strip can drop a navigation pin on click.

function makePlayer(active: PlayerEntity['questState'] = { active: {}, completed: [] }): PlayerEntity {
  return {
    id: 'p1', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: [],
    availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    questState: active,
  } as PlayerEntity;
}

describe('QuestTrackerStrip.pickTrackedStage', () => {
  it('returns null when no quest is active', () => {
    expect(pickTrackedStage(makePlayer())).toBeNull();
  });

  it('returns null when the player has no questState at all', () => {
    const p = makePlayer();
    p.questState = undefined;
    expect(pickTrackedStage(p)).toBeNull();
  });

  it('returns the first active quest with its current stage', () => {
    const player = makePlayer({ active: { rats_in_the_cellar: { stageIndex: 0, progress: 1 } }, completed: [] });
    const tracked = pickTrackedStage(player);
    expect(tracked).toBeDefined();
    expect(tracked!.quest.id).toBe('rats_in_the_cellar');
    expect(tracked!.stageIndex).toBe(0);
    expect(tracked!.progress).toBe(1);
  });

  it('resolves the marker for a talk-stage to the NPC position', () => {
    const player = makePlayer({ active: { rats_in_the_cellar: { stageIndex: 1, progress: 0 } }, completed: [] });
    const tracked = pickTrackedStage(player);
    const npc = QUEST_NPCS.warden_galen;
    expect(tracked!.marker).toEqual({ x: npc.position.x, z: npc.position.z });
  });

  it('falls back to the quest giver position when the stage objective has no marker source', () => {
    // rats_in_the_cellar stage 0 is `kill 3 goblins` — resolves via
    // `getMobZones('goblin')` which returns a real zone position.
    const player = makePlayer({ active: { rats_in_the_cellar: { stageIndex: 0, progress: 0 } }, completed: [] });
    const tracked = pickTrackedStage(player);
    expect(tracked!.marker).toBeDefined();
    expect(typeof tracked!.marker!.x).toBe('number');
    expect(typeof tracked!.marker!.z).toBe('number');
  });

  // §52 playtest follow-up — the strip used to lock onto whichever
  // quest happened to be first in `Object.entries(active)`, ignoring
  // the player's selection in QuestPanel. Now honors `trackedQuestId`.
  it('honors trackedQuestId when set (multi-active scenario)', () => {
    const player = makePlayer({
      active: {
        // Both quests are active; the user picked `bounty_grakk` in
        // QuestPanel, so the strip should show Grakk, not the goblin
        // arc that happens to be earlier in dictionary order.
        rats_in_the_cellar: { stageIndex: 0, progress: 1 },
        bounty_grakk: { stageIndex: 0, progress: 0 },
      },
      completed: [],
    });
    const tracked = pickTrackedStage(player, 'bounty_grakk');
    expect(tracked!.quest.id).toBe('bounty_grakk');
  });

  it('falls back to first active quest when trackedQuestId is not in the active set', () => {
    const player = makePlayer({
      active: { rats_in_the_cellar: { stageIndex: 0, progress: 1 } },
      completed: [],
    });
    // Stale id (player completed this quest and picked it before
    // it left active). Should still surface the actual active one.
    const tracked = pickTrackedStage(player, 'bounty_grakk');
    expect(tracked!.quest.id).toBe('rats_in_the_cellar');
  });

  it('falls back to first active quest when trackedQuestId is null', () => {
    const player = makePlayer({
      active: { rats_in_the_cellar: { stageIndex: 0, progress: 1 } },
      completed: [],
    });
    const tracked = pickTrackedStage(player, null);
    expect(tracked!.quest.id).toBe('rats_in_the_cellar');
  });
});

describe('QuestTrackerStrip.isObjectiveMet', () => {
  it('returns true for a kill objective when count is reached', () => {
    expect(isObjectiveMet({ kind: 'kill', enemyType: 'goblin', count: 3 }, 3)).toBe(true);
    expect(isObjectiveMet({ kind: 'kill', enemyType: 'goblin', count: 3 }, 2)).toBe(false);
  });
  it('returns true for one-step objectives when progress >= 1', () => {
    expect(isObjectiveMet({ kind: 'kill_boss', bossId: 'skadrun' }, 1)).toBe(true);
    expect(isObjectiveMet({ kind: 'kill_boss', bossId: 'skadrun' }, 0)).toBe(false);
    expect(isObjectiveMet({ kind: 'reach', position: { x: 0, y: 0, z: 0 }, radius: 4 }, 1)).toBe(true);
    expect(isObjectiveMet({ kind: 'talk', npcId: 'warden_galen' }, 1)).toBe(true);
    expect(isObjectiveMet({ kind: 'specialize' }, 1)).toBe(true);
    expect(isObjectiveMet({ kind: 'specialize' }, 0)).toBe(false);
  });
  it('returns true for manual objectives unconditionally', () => {
    expect(isObjectiveMet({ kind: 'manual', description: 'whenever' }, 0)).toBe(true);
  });
});

describe('QuestTrackerStrip.formatDistance', () => {
  it('renders sub-metre distances as "<1 m" so the strip never says 0 m at the marker', () => {
    expect(formatDistance(0.3)).toBe('<1 m');
  });
  it('rounds in-metre distances to integers', () => {
    expect(formatDistance(42.7)).toBe('43 m');
    expect(formatDistance(999.4)).toBe('999 m');
  });
  it('switches to km past 1000 with one decimal', () => {
    expect(formatDistance(1500)).toBe('1.5 km');
    expect(formatDistance(10_245)).toBe('10.2 km');
  });
});
