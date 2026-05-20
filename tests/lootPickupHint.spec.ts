import { describe, expect, it } from 'vitest';
import { shouldShowLootHint } from '../apps/client/src/hud/LootPickupHint';
import type { GameClientState, GroundLootStack, PlayerEntity, StarterProgress } from '../apps/client/src/gameTypes';
import { createInitialStarterProgress } from '../apps/client/src/starterProgress';

function makePlayer(): PlayerEntity {
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
    questState: { active: {}, completed: [] },
  } as PlayerEntity;
}

function makeLoot(id: string): GroundLootStack {
  return {
    id, position: { x: 0, y: 0, z: 0 }, items: [{ itemId: 'gold_coin', quantity: 5 }],
    spawnedTs: 0,
  } as GroundLootStack;
}

function makeState(opts: {
  alive?: boolean;
  loot?: number;
  lootPickups?: number;
  isComplete?: boolean;
}): GameClientState {
  const player = makePlayer();
  if (opts.alive === false) player.isAlive = false;
  const groundLoot: Record<string, GroundLootStack> = {};
  for (let i = 0; i < (opts.loot ?? 0); i++) groundLoot[`l${i}`] = makeLoot(`l${i}`);
  const progress: StarterProgress = {
    ...createInitialStarterProgress(),
    lootPickups: opts.lootPickups ?? 0,
    isComplete: opts.isComplete ?? false,
  };
  return {
    myPlayerId: player.id,
    players: { [player.id]: player },
    groundLoot,
    starterProgress: progress,
  } as unknown as GameClientState;
}

describe('shouldShowLootHint', () => {
  it('shows when there is loot nearby and zero pickups so far', () => {
    expect(shouldShowLootHint(makeState({ loot: 1 }))).toBe(true);
  });
  it('hides when the player has already picked up loot', () => {
    expect(shouldShowLootHint(makeState({ loot: 1, lootPickups: 1 }))).toBe(false);
  });
  it('hides when there is no loot on the ground', () => {
    expect(shouldShowLootHint(makeState({ loot: 0 }))).toBe(false);
  });
  it('hides for dead players (no panic prompts while corpsed)', () => {
    expect(shouldShowLootHint(makeState({ loot: 1, alive: false }))).toBe(false);
  });
  it('hides once the starter path is complete (post-tutorial veteran)', () => {
    expect(shouldShowLootHint(makeState({ loot: 1, isComplete: true }))).toBe(false);
  });
});
