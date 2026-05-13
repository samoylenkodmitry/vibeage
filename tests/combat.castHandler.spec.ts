import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { SKILLS } from '../packages/content/skills';
import { handleCastReq } from '../server/combat/castHandler';
import { createActiveCastStore, type ActiveCastStore } from '../server/combat/skillSystem';
import type { PlayerState } from '../shared/types';

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
  let socketEmit: ReturnType<typeof vi.fn>;
  let ioEmit: ReturnType<typeof vi.fn>;
  let socket: Socket;
  let io: Server;
  let activeCasts: ActiveCastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T00:00:00.000Z'));

    player = makePlayer();
    socketEmit = vi.fn();
    ioEmit = vi.fn();
    socket = { id: 'socket1', emit: socketEmit } as unknown as Socket;
    io = { emit: ioEmit } as unknown as Server;
    activeCasts = createActiveCastStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('does not spend mana or start cooldown when authoritative cast creation rejects the request', () => {
    handleCastReq(
      socket,
      player,
      {
        type: 'CastReq',
        id: player.id,
        skillId: 'fireball',
        clientTs: Date.now(),
      },
      io,
      makeWorld(),
      activeCasts,
    );

    expect(player.mana).toBe(100);
    expect(player.skillCooldownEndTs).toEqual({});
    expect(Object.keys(activeCasts)).toHaveLength(0);
    expect(socketEmit).toHaveBeenCalledWith('msg', {
      type: 'CastFail',
      clientSeq: Date.now(),
      reason: 'invalid',
    });
  });

  test('spends mana and starts cooldown after authoritative cast creation succeeds', () => {
    handleCastReq(
      socket,
      player,
      {
        type: 'CastReq',
        id: player.id,
        skillId: 'fireball',
        targetPos: { x: 10, z: 0 },
        clientTs: Date.now(),
      },
      io,
      makeWorld(),
      activeCasts,
    );

    expect(player.mana).toBe(100 - SKILLS.fireball.manaCost);
    expect(player.skillCooldownEndTs.fireball).toBe(Date.now() + SKILLS.fireball.cooldownMs);
    expect(Object.keys(activeCasts)).toHaveLength(1);
    expect(ioEmit).toHaveBeenCalledWith('playerUpdated', expect.objectContaining({
      id: player.id,
      mana: player.mana,
      skillCooldownEndTs: player.skillCooldownEndTs,
    }));
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
