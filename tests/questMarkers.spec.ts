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

describe('questMarkers.resolveStageMarker', () => {
  it('uses an explicit stage marker when present', () => {
    const marker = resolveStageMarker(
      { id: 's1', description: '', objective: { kind: 'manual', description: '' }, marker: { x: 7, y: 0, z: 9 } },
      null,
    );
    expect(marker).toEqual({ x: 7, z: 9 });
  });
  it('falls back to the giver position when no marker source applies', () => {
    const marker = resolveStageMarker(
      { id: 's2', description: '', objective: { kind: 'manual', description: '' } },
      { x: 1, y: 0, z: 2 },
    );
    expect(marker).toEqual({ x: 1, z: 2 });
  });
  // §52 playtest follow-up — readyToClaim must override the stage's
  // own marker. Pre-fix, "Show on map" pointed at the original kill
  // zone, the player walked away from the giver, and the server
  // then rejected the claim with `notNearNpc`.
  it('routes to the giver when entry.readyToClaim, even with a kill-stage objective', () => {
    const marker = resolveStageMarker(
      { id: 's3', description: '', objective: { kind: 'kill', enemyType: 'rat', count: 5 } },
      { x: 4, y: 0, z: 4 }, // giver position
      true, // readyToClaim
    );
    // Without the readyToClaim flag this would return the rat zone
    // centre; with it, the giver wins.
    expect(marker).toEqual({ x: 4, z: 4 });
  });
  it('respects an explicit stage marker over readyToClaim is FALSE — explicit marker still wins on the active stage path', () => {
    // readyToClaim=false should NOT change the legacy behaviour:
    // explicit stage.marker still wins for the stage walk-up.
    const marker = resolveStageMarker(
      { id: 's4', description: '', objective: { kind: 'manual', description: '' }, marker: { x: 7, y: 0, z: 9 } },
      { x: 1, y: 0, z: 2 },
      false,
    );
    expect(marker).toEqual({ x: 7, z: 9 });
  });
  it("falls through to stage logic when readyToClaim=true but giverPos is null (defensive)", () => {
    const marker = resolveStageMarker(
      { id: 's5', description: '', objective: { kind: 'reach', position: { x: 9, y: 0, z: 9 }, radius: 2 } },
      null,
      true,
    );
    expect(marker).toEqual({ x: 9, z: 9 });
  });
});

describe('questMarkers.listActiveQuestMarkers — readyToClaim path', () => {
  it('emits the giver position for a quest whose entry has readyToClaim=true', () => {
    // rats_in_the_cellar: stage 0 is the kill objective. Pre-fix this
    // would return the rat zone center even when the quest was ready.
    const player = makePlayer({
      active: { rats_in_the_cellar: { stageIndex: 0, progress: 5, readyToClaim: true } },
      completed: [],
    });
    const markers = listActiveQuestMarkers(player);
    const npc = QUEST_NPCS.warden_galen;
    expect(markers[0].marker).toEqual({ x: npc.position.x, z: npc.position.z });
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
