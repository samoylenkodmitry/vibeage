import { describe, expect, test, vi } from 'vitest';
import {
  legacyCastSkillRequestToClientMessage,
  legacyMoveStartToClientMessage,
  legacyMoveStopToClientMessage,
} from '../server/transport/legacyClientMessages';
import {
  AUTHORITATIVE_ROOM_STATE_KEYS,
  SOCKET_SESSION_EVENTS,
  WORLD_CLIENT_COMMAND_TYPES,
} from '../server/transport/roomBoundary';

describe('transport boundary', () => {
  test('documents the state and command surface for a future room implementation', () => {
    expect(AUTHORITATIVE_ROOM_STATE_KEYS).toEqual([
      'players',
      'enemies',
      'activeCasts',
      'effectsByTarget',
      'projectiles',
      'groundLoot',
      'zones',
    ]);
    expect(WORLD_CLIENT_COMMAND_TYPES).toContain('MoveIntent');
    expect(WORLD_CLIENT_COMMAND_TYPES).toContain('CastReq');
    expect(WORLD_CLIENT_COMMAND_TYPES).toContain('RequestInventory');
    expect(SOCKET_SESSION_EVENTS.message).toBe('msg');
  });

  test('converts legacy socket events into current protocol commands', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T00:00:00.000Z'));

    expect(legacyMoveStartToClientMessage({
      id: 'player1',
      to: { x: 3, z: 4 },
      ts: 100,
    })).toEqual({
      type: 'MoveIntent',
      id: 'player1',
      targetPos: { x: 3, z: 4 },
      clientTs: 100,
    });
    expect(legacyMoveStopToClientMessage({
      id: 'player1',
      pos: { x: 1, z: 2 },
      ts: 200,
    })).toEqual({
      type: 'MoveIntent',
      id: 'player1',
      targetPos: { x: 1, z: 2 },
      clientTs: 200,
    });
    expect(legacyCastSkillRequestToClientMessage({
      skillId: 'fireball',
      targetId: 'enemy1',
    }, 'player1')).toEqual({
      type: 'CastReq',
      id: 'player1',
      skillId: 'fireball',
      targetId: 'enemy1',
      clientTs: Date.now(),
    });

    vi.useRealTimers();
  });
});
