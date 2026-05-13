import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILLS, SkillId } from '../packages/content/skills';
import { CastState } from '../packages/protocol/messages';
import { PlayerState } from '../shared/types';
import type { ActiveCastStore } from '../server/combat/skillSystem';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

type SkillSystem = typeof import('../server/combat/skillSystem');

const makePlayer = (): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'Caster',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],
  skillShortcuts: [],
  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 1,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  inventory: [],
  maxInventorySlots: 20,
});

const makeEnemy = () => ({
  id: 'enemy1',
  type: 'goblin',
  position: { x: 1, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  isAlive: true,
  statusEffects: [],
  aiState: 'idle',
});

describe('Cast State Machine', () => {
  let skillSystem: SkillSystem;
  let activeCasts: ActiveCastStore;
  let outboundEvents: OutboundEvent[];
  let outbound: OutboundEventSink;
  let player: PlayerState;
  let enemy: ReturnType<typeof makeEnemy>;
  let world: {
    getEnemyById: ReturnType<typeof vi.fn>;
    getPlayerById: ReturnType<typeof vi.fn>;
    getEntitiesInCircle: ReturnType<typeof vi.fn>;
    onTargetDied: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-05-04T00:00:00.000Z'));

    skillSystem = await import('../server/combat/skillSystem');
    activeCasts = skillSystem.createActiveCastStore();
    outboundEvents = [];
    outbound = { publish: vi.fn((event: OutboundEvent) => outboundEvents.push(event)) };
    player = makePlayer();
    enemy = makeEnemy();
    world = {
      getEnemyById: vi.fn((id: string) => (id === enemy.id ? enemy : null)),
      getPlayerById: vi.fn((id: string) => (id === player.id ? player : null)),
      getEntitiesInCircle: vi.fn(() => [enemy]),
      onTargetDied: vi.fn(),
    };
  });

  it('transitions projectile casts from Casting to Traveling with CastSnapshot messages', () => {
    const castId = skillSystem.handleCastRequest(
      activeCasts,
      player,
      player.id,
      'fireball',
      { x: 10, z: 0 },
      undefined,
      outbound,
      world
    );

    expect(typeof castId).toBe('string');
    vi.advanceTimersByTime(SKILLS.fireball.castMs);
    skillSystem.tickCasts(activeCasts, 100, outbound, world);

    const cast = skillSystem.getCastById(activeCasts, castId as string);
    expect(cast?.state).toBe(CastState.Traveling);
    expect(outboundEvents).toContainEqual(expect.objectContaining({
      type: 'serverMessage',
      message: expect.objectContaining({
        type: 'CastSnapshot',
        data: expect.objectContaining({ castId, state: CastState.Traveling }),
      }),
    }));
    expect(outboundEvents).not.toContainEqual(expect.objectContaining({
      message: expect.objectContaining({ type: 'ProjSpawn2' }),
    }));
  });

  it('resolves projectile impact through v2 snapshots and combat log messages', () => {
    const castId = skillSystem.handleCastRequest(
      activeCasts,
      player,
      player.id,
      'fireball',
      undefined,
      enemy.id,
      outbound,
      world
    ) as string;

    vi.advanceTimersByTime(SKILLS.fireball.castMs);
    skillSystem.tickCasts(activeCasts, 100, outbound, world);
    vi.advanceTimersByTime(100);
    skillSystem.tickCasts(activeCasts, 100, outbound, world);

    const cast = skillSystem.getCastById(activeCasts, castId);
    expect(cast?.state).toBe(CastState.Impact);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    expect(outboundEvents).toContainEqual(expect.objectContaining({
      type: 'serverMessage',
      message: expect.objectContaining({
        type: 'CastSnapshot',
        data: expect.objectContaining({ castId, state: CastState.Impact }),
      }),
    }));
    expect(outboundEvents).toContainEqual(expect.objectContaining({
      type: 'serverMessage',
      message: expect.objectContaining({
        type: 'CombatLog',
        castId,
        targets: expect.arrayContaining([enemy.id]),
      }),
    }));
    expect(outboundEvents).not.toContainEqual(expect.objectContaining({
      message: expect.objectContaining({ type: 'ProjHit2' }),
    }));
  });

  it('resolves instant skills without a Traveling state', () => {
    const skillId: SkillId = 'petrify';
    const castId = skillSystem.handleCastRequest(
      activeCasts,
      player,
      player.id,
      skillId,
      undefined,
      enemy.id,
      outbound,
      world
    ) as string;

    vi.advanceTimersByTime(SKILLS[skillId].castMs);
    skillSystem.tickCasts(activeCasts, 100, outbound, world);

    const cast = skillSystem.getCastById(activeCasts, castId);
    expect(cast?.state).toBe(CastState.Impact);
    expect(outboundEvents).toContainEqual(expect.objectContaining({
      type: 'serverMessage',
      message: expect.objectContaining({
        type: 'CastSnapshot',
        data: expect.objectContaining({ castId, state: CastState.Impact }),
      }),
    }));
    expect(outboundEvents).toContainEqual(expect.objectContaining({
      type: 'serverMessage',
      message: expect.objectContaining({
        type: 'CombatLog',
        castId,
        targets: expect.arrayContaining([enemy.id]),
      }),
    }));
  });

  it('keeps casts in Casting while cast time is incomplete', () => {
    const castId = skillSystem.handleCastRequest(
      activeCasts,
      player,
      player.id,
      'fireball',
      { x: 10, z: 0 },
      undefined,
      outbound,
      world
    ) as string;

    vi.advanceTimersByTime(SKILLS.fireball.castMs - 1);
    skillSystem.tickCasts(activeCasts, 100, outbound, world);

    const cast = skillSystem.getCastById(activeCasts, castId);
    expect(cast?.state).toBe(CastState.Casting);
  });
});
