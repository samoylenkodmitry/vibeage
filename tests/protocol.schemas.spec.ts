import { describe, expect, it } from 'vitest';
import {
  describeProtocolError,
  safeParseClientMessage,
  safeParseServerMessage,
} from '../shared/messages';
import { CastState } from '../shared/types';

describe('protocol schemas', () => {
  it('accepts a valid client CastReq', () => {
    const parsed = safeParseClientMessage({
      type: 'CastReq',
      id: 'player-1',
      skillId: 'fireball',
      targetId: 'enemy-1',
      clientTs: 1746316800000,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects malformed client messages before server handling', () => {
    const parsed = safeParseClientMessage({
      type: 'CastReq',
      id: 'player-1',
      skillId: 'unknown-skill',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(describeProtocolError(parsed.error)).toContain('skillId');
    }
  });

  it('accepts current server CastSnapshot messages', () => {
    const parsed = safeParseServerMessage({
      type: 'CastSnapshot',
      data: {
        castId: 'cast-1',
        casterId: 'player-1',
        skillId: 'fireball',
        state: CastState.Traveling,
        origin: { x: 0, z: 0 },
        pos: { x: 1, z: 0 },
        dir: { x: 1, z: 0 },
        startedAt: 1746316800000,
        castTimeMs: 300,
        progressMs: 300,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts inventory updates with the current playerId extension', () => {
    const parsed = safeParseServerMessage({
      type: 'InventoryUpdate',
      playerId: 'player-1',
      inventory: [{ itemId: 'health_potion', quantity: 2 }],
      maxInventorySlots: 20,
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects unknown server message types', () => {
    const parsed = safeParseServerMessage({
      type: 'LegacyProjectile',
      castId: 'cast-1',
    });

    expect(parsed.success).toBe(false);
  });
});
