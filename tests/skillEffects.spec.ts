import { describe, expect, test, vi } from 'vitest';
import { createCombatWorld } from '../server/combat/combatWorld';
import { resolveCastImpact } from '../server/combat/impactResolver';
import type { Cast } from '../server/combat/skillSystem';
import { createEnemy } from '../server/enemies/enemyLifecycle';
import { createGameState } from '../server/gameState';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'Buffed',
  position: { x: 0, y: 0.5, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 80,
  maxHealth: 200,
  mana: 100,
  maxMana: 100,
  className: 'paladin',
  unlockedSkills: ['holyLight', 'divineShield', 'dispel'],

  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  maxInventorySlots: 20,
  ...overrides,
});

function makeWorld(players: PlayerState[]) {
  const state = createGameState();
  for (const player of players) {
    state.players[player.id] = player;
  }
  const noop = vi.fn();
  const world = createCombatWorld(state, noop);
  return { state, world };
}

function makeImpactCast(skillId: Cast['skillId'], casterId: string): Cast {
  return {
    castId: `${skillId}-test`,
    skillId,
    casterId,
    targetId: undefined,
    castStartTs: 0,
    castTimeMs: 100,
    progressMs: 100,
    state: 1,
    pos: { x: 0, y: 0.5, z: 0 },
    origin: { x: 0, y: 0.5, z: 0 },
  } as unknown as Cast;
}

describe('skill effect server semantics', () => {
  test('holyLight heals the caster up to maxHealth', () => {
    const player = makePlayer({ health: 50, maxHealth: 200 });
    const { world } = makeWorld([player]);
    const outbound = { publish: vi.fn() };

    resolveCastImpact(makeImpactCast('holyLight', player.id), outbound, world);

    expect(player.health).toBeGreaterThan(50);
    expect(player.health).toBeLessThanOrEqual(player.maxHealth);
  });

  test('divineShield adds a shield status effect that absorbs incoming damage', () => {
    const player = makePlayer({ health: 100, maxHealth: 200 });
    const { state, world } = makeWorld([player]);
    const outbound = { publish: vi.fn() };

    resolveCastImpact(makeImpactCast('divineShield', player.id), outbound, world);

    const shield = player.statusEffects.find((effect) => effect.type === 'shield');
    expect(shield).toBeDefined();
    expect(shield?.value).toBeGreaterThan(0);

    const enemy = createEnemy('goblin', 1, { x: 1, y: 0.5, z: 0 }, 1);
    state.enemies[enemy.id] = enemy;
    resolveCastImpact({
      castId: 'incoming-1',
      skillId: 'fireball',
      casterId: enemy.id,
      targetId: player.id,
      castStartTs: 0,
      castTimeMs: 100,
      progressMs: 100,
      state: 1,
      pos: player.position,
      origin: player.position,
    } as unknown as Cast, outbound, world);

    expect(player.health).toBe(100);
  });

  test('dispel removes negative status effects from the caster', () => {
    const player = makePlayer({
      statusEffects: [
        { id: 'a', type: 'slow', value: 50, durationMs: 5000, startTimeTs: 0, sourceSkill: 'iceBolt' },
        { id: 'b', type: 'shield', value: 100, durationMs: 5000, startTimeTs: 0, sourceSkill: 'divineShield' },
        { id: 'c', type: 'burn', value: 5, durationMs: 5000, startTimeTs: 0, sourceSkill: 'fireball' },
      ],
    });
    const { world } = makeWorld([player]);
    const outbound = { publish: vi.fn() };

    resolveCastImpact(makeImpactCast('dispel', player.id), outbound, world);

    expect(player.statusEffects.find((e) => e.type === 'slow')).toBeUndefined();
    expect(player.statusEffects.find((e) => e.type === 'burn')).toBeUndefined();
    expect(player.statusEffects.find((e) => e.type === 'shield')).toBeDefined();
  });
});
