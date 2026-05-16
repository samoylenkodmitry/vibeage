import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import { CastState } from '../packages/protocol/messages';
import { PlayerState } from '../packages/sim/entities';
import type { ActiveCastStore } from '../server/combat/skillSystem';
import type { OutboundEvent, OutboundEventSink } from '../server/transport/outboundEvents';

type SkillSystem = typeof import('../server/combat/skillSystem');

const makePlayer = (): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'Caster',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 50,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'healer',
  unlockedSkills: ['holyLight', 'divineShield', 'smite'],
  skillShortcuts: [],
  availableSkillPoints: 0,
  skillCooldownEndTs: {},
  statusEffects: [],
  level: 5,
  experience: 0,
  experienceToNextLevel: 100,
  castingSkill: null,
  castingProgressMs: 0,
  isAlive: true,
  inventory: [],
  maxInventorySlots: 20,
});

let skillSystem: SkillSystem;
let activeCasts: ActiveCastStore;
let outboundEvents: OutboundEvent[];
let outbound: OutboundEventSink;
let player: PlayerState;
let world: {
  getEnemyById: ReturnType<typeof vi.fn>;
  getPlayerById: ReturnType<typeof vi.fn>;
  getEntitiesInCircle: ReturnType<typeof vi.fn>;
  onTargetDied: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-16T00:00:00.000Z'));

  skillSystem = await import('../server/combat/skillSystem');
  activeCasts = skillSystem.createActiveCastStore();
  outboundEvents = [];
  outbound = { publish: vi.fn((event: OutboundEvent) => outboundEvents.push(event)) };
  player = makePlayer();
  world = {
    getEnemyById: vi.fn(() => null),
    getPlayerById: vi.fn((id: string) => (id === player.id ? player : null)),
    getEntitiesInCircle: vi.fn(() => [player]),
    onTargetDied: vi.fn(),
  };
});

describe('self-cast targeting', () => {
  it('accepts holyLight with no target or position (self-cast)', () => {
    expect(SKILLS.holyLight.requiresTarget).toBeFalsy();
    const result = skillSystem.handleCastRequest({
      activeCasts,
      player,
      casterId: player.id,
      skillId: 'holyLight',
      targetPos: undefined,
      targetId: undefined,
      outbound,
      world,
    });

    expect(result).not.toBe('missingTarget');
    expect(typeof result).toBe('string');
    const cast = skillSystem.getCastById(activeCasts, result as string);
    expect(cast).toBeDefined();
    expect(cast?.state).toBe(CastState.Casting);
  });

  it('accepts divineShield with no target or position (self-cast)', () => {
    expect(SKILLS.divineShield.requiresTarget).toBeFalsy();
    const result = skillSystem.handleCastRequest({
      activeCasts,
      player,
      casterId: player.id,
      skillId: 'divineShield',
      targetPos: undefined,
      targetId: undefined,
      outbound,
      world,
    });

    expect(result).not.toBe('missingTarget');
    const cast = skillSystem.getCastById(activeCasts, result as string);
    expect(cast).toBeDefined();
  });

  it('rejects smite with no target (smite has requiresTarget: true)', () => {
    expect(SKILLS.smite.requiresTarget).toBe(true);
    const result = skillSystem.handleCastRequest({
      activeCasts,
      player,
      casterId: player.id,
      skillId: 'smite',
      targetPos: undefined,
      targetId: undefined,
      outbound,
      world,
    });

    expect(result).toBe('missingTarget');
  });
});
