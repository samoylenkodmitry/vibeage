import { describe, expect, it } from 'vitest';
import {
  CastState,
  describeProtocolError,
  safeParseClientMessage,
  safeParseServerMessage,
} from '../packages/protocol/messages';

describe('client protocol schemas', () => {
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

  it('rejects retired legacy movement messages before world handling', () => {
    const parsed = safeParseClientMessage({
      type: 'MoveStart',
      id: 'player-1',
      path: [{ x: 1, z: 2 }],
      speed: 5,
      clientTs: 1746316800000,
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts the current movement command shape', () => {
    const parsed = safeParseClientMessage({
      type: 'MoveIntent',
      id: 'player-1',
      targetPos: { x: 1, z: 2 },
      speed: 5,
      clientTs: 1746316800000,
    });

    expect(parsed.success).toBe(true);
  });
});

describe('server protocol schemas', () => {
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

  it('accepts server-authored starter progress updates', () => {
    const parsed = safeParseServerMessage({
      type: 'StarterProgressUpdate',
      progress: {
        defeatedEnemies: 3,
        defeatedEnemyIds: ['enemy-1', 'enemy-2', 'enemy-3'],
        lootPickups: 3,
        levelReached: 2,
        learnedSkills: 1,
        isComplete: true,
        rewardGranted: true,
      },
      rewardGranted: true,
    });

    expect(parsed.success).toBe(true);
  });

});

describe('server protocol rejection schemas', () => {
  it('validates nested messages inside BatchUpdate', () => {
    const parsed = safeParseServerMessage({
      type: 'BatchUpdate',
      updates: [
        {
          type: 'CastSnapshot',
          data: {
            castId: 'cast-1',
            casterId: 'player-1',
            skillId: 'unknown-skill',
            state: CastState.Traveling,
            origin: { x: 0, z: 0 },
            pos: { x: 1, z: 0 },
            dir: { x: 1, z: 0 },
            startedAt: 1746316800000,
            castTimeMs: 300,
            progressMs: 300,
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it('validates LootSpawn y coordinates when present', () => {
    const parsed = safeParseServerMessage({
      type: 'LootSpawn',
      enemyId: 'enemy-1',
      position: { x: 1, y: 'bad', z: 2 },
      loot: [{ itemId: 'health_potion', quantity: 1 }],
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects unknown server message types', () => {
    const parsed = safeParseServerMessage({
      type: 'LegacyProjectile',
      castId: 'cast-1',
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects removed projectile protocol messages', () => {
    expect(safeParseServerMessage({
      type: 'ProjSpawn2',
      castId: 'cast-1',
      skillId: 'fireball',
      origin: { x: 0, y: 1, z: 0 },
      dir: { x: 1, z: 0 },
      speed: 22,
      launchTs: 1746316800000,
      casterId: 'player-1',
    }).success).toBe(false);

    expect(safeParseServerMessage({
      type: 'ProjHit2',
      castId: 'cast-1',
      hitIds: ['enemy-1'],
      dmg: [100],
    }).success).toBe(false);
  });
});
