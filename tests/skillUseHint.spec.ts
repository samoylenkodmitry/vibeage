import { describe, expect, it } from 'vitest';
import { pickSkillUseHint } from '../apps/client/src/hud/SkillUseHint';
import type { GameClientState, PlayerEntity, StarterProgress } from '../apps/client/src/gameTypes';
import { createInitialStarterProgress } from '../apps/client/src/starterProgress';

function makePlayer(opts: { alive?: boolean; className?: string } = {}): PlayerEntity {
  return {
    id: 'p1', name: 'p', position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: (opts.className ?? 'mage'),
    race: 'human',
    unlockedSkills: [],
    availableSkillPoints: 0, level: 1,
    experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: opts.alive ?? true,
    skillCooldownEndTs: {}, statusEffects: [],
    specializationId: null,
    skillLevels: {},
    questState: { active: {}, completed: [] },
  } as PlayerEntity;
}

function makeState(opts: {
  alive?: boolean;
  className?: string;
  selectedTargetId?: string | null;
  defeatedEnemies?: number;
  isComplete?: boolean;
}): GameClientState {
  const player = makePlayer({ alive: opts.alive, className: opts.className });
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

describe('pickSkillUseHint', () => {
  it('returns null when no target is selected', () => {
    expect(pickSkillUseHint(makeState({ selectedTargetId: null }))).toBeNull();
  });
  it('returns hint copy when target selected, no kills, alive, mid-tutorial', () => {
    const copy = pickSkillUseHint(makeState({ selectedTargetId: 'gob1' }));
    expect(copy).not.toBeNull();
    expect(copy?.hotkey).toBe('1');
    // Mage starter is Fireball — verify the name resolves.
    expect(copy?.skillName).toBe('Fireball');
  });
  it('returns Slash for warrior (class-specific starter)', () => {
    const copy = pickSkillUseHint(makeState({ selectedTargetId: 'gob1', className: 'warrior' }));
    expect(copy?.skillName).toBe('Slash');
  });
  it('hides after the first defeated enemy', () => {
    expect(pickSkillUseHint(makeState({ selectedTargetId: 'gob1', defeatedEnemies: 1 }))).toBeNull();
  });
  it('hides for dead players', () => {
    expect(pickSkillUseHint(makeState({ selectedTargetId: 'gob1', alive: false }))).toBeNull();
  });
  it('hides once the starter path is complete', () => {
    expect(pickSkillUseHint(makeState({ selectedTargetId: 'gob1', isComplete: true }))).toBeNull();
  });
});
