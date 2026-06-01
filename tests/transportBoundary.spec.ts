import { describe, expect, test } from 'vitest';
import {
  AUTHORITATIVE_ROOM_STATE_KEYS,
  MIN_CLIENT_PROTOCOL_VERSION,
  parseWorldRoomJoinOptions,
  SOCKET_SESSION_EVENTS,
  WORLD_CLIENT_COMMAND_TYPES,
} from '../server/transport/roomBoundary';

describe('transport boundary', () => {
  test('documents the state and command surface for a future room implementation', () => {
    expect(AUTHORITATIVE_ROOM_STATE_KEYS).toEqual([
      'players',
      'enemies',
      'activeCasts',
      'activePhysicsFields',
      'effectsByTarget',
      'projectiles',
      'groundLoot',
      'zones',
    ]);
    expect(WORLD_CLIENT_COMMAND_TYPES).toContain('MoveIntent');
    expect(WORLD_CLIENT_COMMAND_TYPES).toContain('CastReq');
    expect(WORLD_CLIENT_COMMAND_TYPES).toContain('RequestInventory');
    expect(MIN_CLIENT_PROTOCOL_VERSION).toBe(2);
    expect(SOCKET_SESSION_EVENTS.message).toBe('msg');
    expect(SOCKET_SESSION_EVENTS.playerUpdated).toBe('playerUpdated');
    expect(parseWorldRoomJoinOptions({
      playerName: 'Tester',
      clientProtocolVersion: 2,
      ignored: true,
    })).toEqual({
      playerName: 'Tester',
      clientProtocolVersion: 2,
    });
  });
});
