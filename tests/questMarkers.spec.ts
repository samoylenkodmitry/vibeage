import { describe, expect, it } from 'vitest';
import { listActiveQuestMarkers, resolveStageMarker } from '../apps/client/src/hud/questMarkers';
import type { PlayerEntity } from '../apps/client/src/gameTypes';
import { QUEST_NPCS } from '../packages/content/npcs';

/**
 * §49/M2 — shared quest-marker resolver. Verifies the helper still
 * produces the same per-stage marker the panels used to compute
 * inline + that listActiveQuestMarkers walks every active quest.
 */

function makePlayer(active: PlayerEntity['questState'] = { active: {}, completed: [] }): PlayerEntity {
  return {
    id: 'p1', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: [], skillShortcuts: [],
    availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    questState: active,
  } as PlayerEntity;
}

describe('questMarkers.resolveStageMarker', () => {
  it('uses an explicit stage marker when present', () => {
    const marker = resolveStageMarker(
      { description: '', objective: { kind: 'manual', description: '' }, marker: { x: 7, y: 0, z: 9 } },
      null,
    );
    expect(marker).toEqual({ x: 7, z: 9 });
  });
  it('falls back to the giver position when no marker source applies', () => {
    const marker = resolveStageMarker(
      { description: '', objective: { kind: 'manual', description: '' } },
      { x: 1, y: 0, z: 2 },
    );
    expect(marker).toEqual({ x: 1, z: 2 });
  });
});

describe('questMarkers.listActiveQuestMarkers', () => {
  it('returns one entry per active quest', () => {
    const player = makePlayer({
      active: { rats_in_the_cellar: { stageIndex: 1, progress: 0 } },
      completed: [],
    });
    const markers = listActiveQuestMarkers(player);
    expect(markers).toHaveLength(1);
    const npc = QUEST_NPCS.warden_galen;
    expect(markers[0].marker).toEqual({ x: npc.position.x, z: npc.position.z });
    expect(markers[0].questId).toBe('rats_in_the_cellar');
  });
  it('returns an empty list when no quest is active', () => {
    expect(listActiveQuestMarkers(makePlayer())).toEqual([]);
  });
});
