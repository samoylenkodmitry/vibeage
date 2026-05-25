import { describe, expect, it } from 'vitest';
import { shouldShowTargetingHint } from '../apps/client/src/hud/TargetingHint';
import type { GameClientState, PlayerEntity, StarterProgress } from '../apps/client/src/gameTypes';
import { createInitialStarterProgress } from '../apps/client/src/starterProgress';

function makePlayer(opts: { alive?: boolean; activeKill?: boolean } = {}): PlayerEntity {
  const active = opts.activeKill === false
    ? {}
    : { rats_in_the_cellar: { stageIndex: 0, progress: 0 } };
  return {
    id: 'p1', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', race: 'human',
    unlockedSkills: [],
    availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: opts.alive ?? true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    questState: { active, completed: [] },
  } as PlayerEntity;
}

function makeState(opts: {
  alive?: boolean;
  activeKill?: boolean;
  selectedTargetId?: string | null;
  defeatedEnemies?: number;
  isComplete?: boolean;
}): GameClientState {
  const player = makePlayer({ alive: opts.alive, activeKill: opts.activeKill });
  const progress: StarterProgress = {
    ...createInitialStarterProgress(),
    defeatedEnemies: opts.defeatedEnemies ?? 0,
    isComplete: opts.isComplete ?? false,
  };
  return {
    myPlayerId: player.id,
    players: { [player.id]: player },
    selectedTargetId: opts.selectedTargetId ?? null,
    starterProgress: progress,
  } as unknown as GameClientState;
}

describe('shouldShowTargetingHint', () => {
  it('shows when the player has a kill quest and no target', () => {
    expect(shouldShowTargetingHint(makeState({}))).toBe(true);
  });
  it('hides once a target is selected', () => {
    expect(shouldShowTargetingHint(makeState({ selectedTargetId: 'gob1' }))).toBe(false);
  });
  it('hides once the player has defeated at least one enemy', () => {
    expect(shouldShowTargetingHint(makeState({ defeatedEnemies: 1 }))).toBe(false);
  });
  it('hides for dead players (no panic prompts while corpsed)', () => {
    expect(shouldShowTargetingHint(makeState({ alive: false }))).toBe(false);
  });
  it('hides when the starter path is complete', () => {
    expect(shouldShowTargetingHint(makeState({ isComplete: true }))).toBe(false);
  });
  it('hides when the active quest has no kill objective in the current stage', () => {
    // No active quests => no kill objective => no hint.
    expect(shouldShowTargetingHint(makeState({ activeKill: false }))).toBe(false);
  });
});
