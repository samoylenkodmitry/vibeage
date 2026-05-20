import { describe, expect, it } from 'vitest';
import { pickReturnNpc } from '../apps/client/src/hud/ReturnToNpcHint';
import type { GameClientState, PlayerEntity, StarterProgress } from '../apps/client/src/gameTypes';
import { createInitialStarterProgress } from '../apps/client/src/starterProgress';

/**
 * §49/M2 — return-to-NPC hint visibility. Verifies the predicate
 * fires for the starter quest's stage-1 talk objective and shuts
 * off as soon as the talk progress flips or the player completes
 * the starter path.
 */
function makePlayer(opts: {
  alive?: boolean;
  questStageIndex?: number;
  talkProgress?: number;
} = {}): PlayerEntity {
  return {
    id: 'p1', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: [], skillShortcuts: [],
    availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: opts.alive ?? true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    questState: {
      // Stage 1 of rats_in_the_cellar is `talk warden_galen`.
      active: {
        rats_in_the_cellar: {
          stageIndex: opts.questStageIndex ?? 1,
          progress: opts.talkProgress ?? 0,
        },
      },
      completed: [],
    },
  } as PlayerEntity;
}

function makeState(opts: {
  alive?: boolean;
  questStageIndex?: number;
  talkProgress?: number;
  isComplete?: boolean;
}): GameClientState {
  const player = makePlayer(opts);
  const progress: StarterProgress = {
    ...createInitialStarterProgress(),
    isComplete: opts.isComplete ?? false,
  };
  return {
    myPlayerId: player.id,
    players: { [player.id]: player },
    starterProgress: progress,
  } as unknown as GameClientState;
}

describe('pickReturnNpc', () => {
  it('returns the NPC when the active quest is on a talk stage with progress 0', () => {
    const npc = pickReturnNpc(makeState({}));
    expect(npc).not.toBeNull();
    expect(npc?.npcId).toBe('warden_galen');
  });
  it('hides once talk-objective progress flips to 1', () => {
    expect(pickReturnNpc(makeState({ talkProgress: 1 }))).toBeNull();
  });
  it('hides when the current stage is not a talk objective (stage 0 = kill)', () => {
    expect(pickReturnNpc(makeState({ questStageIndex: 0 }))).toBeNull();
  });
  it('hides for dead players', () => {
    expect(pickReturnNpc(makeState({ alive: false }))).toBeNull();
  });
  it('hides once the starter path is complete', () => {
    expect(pickReturnNpc(makeState({ isComplete: true }))).toBeNull();
  });
});
