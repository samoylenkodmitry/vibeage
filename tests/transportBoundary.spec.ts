import { describe, expect, test } from 'vitest';
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
});
