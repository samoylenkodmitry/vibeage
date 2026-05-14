import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SKILLS } from '../packages/content/skills';
import type { CastReq, VecXZ } from '../packages/protocol/messages';
import { handleCastReq } from '../server/combat/castHandler';
import { createActiveCastStore, type ActiveCastStore } from '../server/combat/skillSystem';
import type { DirectMessageSink, OutboundEventSink } from '../server/transport/outboundEvents';
import type { PlayerState } from '../packages/sim/entities';

const makePlayer = (): PlayerState => ({
  id: 'player1',
  socketId: 'socket1',
  name: 'CastTester',
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  health: 100,
  maxHealth: 100,
  mana: 100,
  maxMana: 100,
  className: 'mage',
  unlockedSkills: ['fireball'],
  skillShortcuts: ['fireball', null, null, null, null, null, null, null, null],
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

describe('cast handler resources', () => {
  let player: PlayerState;
  let directSend: ReturnType<typeof vi.fn>;
  let outboundPublish: ReturnType<typeof vi.fn>;
  let socket: { id: string };
  let direct: DirectMessageSink;
  let outbound: OutboundEventSink;
  let activeCasts: ActiveCastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T00:00:00.000Z'));

    player = makePlayer();
    directSend = vi.fn();
    outboundPublish = vi.fn();
    socket = { id: 'socket1' };
    direct = { send: directSend };
    outbound = { publish: outboundPublish };
    activeCasts = createActiveCastStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function sendFireball(targetPos?: VecXZ): void {
    const msg: CastReq = {
      type: 'CastReq',
      id: player.id,
      skillId: 'fireball',
      clientTs: Date.now(),
    };
    if (targetPos) {
      msg.targetPos = targetPos;
    }
    handleCastReq(
      socket,
      player,
      msg,
      {
        direct,
        outbound,
      },
      makeWorld(),
      activeCasts,
    );
  }

  test('does not spend mana or start cooldown when authoritative cast creation rejects the request', () => {
    sendFireball();
    expect(player.mana).toBe(100);
    expect(player.skillCooldownEndTs).toEqual({});
    expect(Object.keys(activeCasts)).toHaveLength(0);
    expect(directSend).toHaveBeenCalledWith({
      type: 'CastFail',
      clientSeq: Date.now(),
      reason: 'invalid',
    });
  });

  test('spends mana and starts cooldown after authoritative cast creation succeeds', () => {
    sendFireball({ x: 10, z: 0 });
    expect(player.mana).toBe(100 - SKILLS.fireball.manaCost);
    expect(player.skillCooldownEndTs.fireball).toBe(Date.now() + SKILLS.fireball.cooldownMs);
    expect(Object.keys(activeCasts)).toHaveLength(1);
    expect(outboundPublish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'playerUpdated',
      update: expect.objectContaining({
        id: player.id,
        mana: player.mana,
        skillCooldownEndTs: player.skillCooldownEndTs,
      }),
    }));
  });

  test('rejects locked skills before starting authoritative casts', () => {
    player.unlockedSkills = [];
    sendFireball({ x: 10, z: 0 });
    expect(player.mana).toBe(100);
    expect(Object.keys(activeCasts)).toHaveLength(0);
    expect(directSend).toHaveBeenCalledWith({
      type: 'CastFail',
      clientSeq: Date.now(),
      reason: 'invalid',
    });
    expect(outboundPublish).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'playerUpdated' }));
  });
});

function makeWorld() {
  return {
    getEnemyById: vi.fn(() => null),
    getPlayerById: vi.fn(() => null),
    getEntitiesInCircle: vi.fn(() => []),
    onTargetDied: vi.fn(),
  };
}
