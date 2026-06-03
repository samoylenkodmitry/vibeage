import { describe, expect, it } from 'vitest';
import {
  OWNER_PLAYER_FIELDS,
  PRIVATE_PLAYER_STATE_FIELDS,
  PUBLIC_PLAYER_FIELDS,
  sanitizePlayerForOwner,
  sanitizePlayerForPublic,
  type OwnerEquipmentSnapshot,
  type OwnerInventorySnapshot,
} from '../server/transport/clientState';
import { createTransientPlayer } from '../server/playerFactory';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import type { PlayerState } from '../packages/sim/entities';
import type { EquipmentUpdateMsg, InventoryUpdateMsg } from '../packages/protocol/messages';

/**
 * §52 #3 / §5 — exact-key tests for the owner DTO trio.
 */

const PERSISTENCE_INTERNAL_FIELDS = new Set([
  'socketId',
  'accountId',
  'accountLogin',
  'lastUpdateTime',
  'lastSnapTime',
  'positionDirty',
  'lastRegenTimeMs',
  'posHistory',
  'usedResurrectionThisLife',
  'characterInventory',
  'inventory',
]);

function freshOwner(): PlayerState {
  const player = createTransientPlayer('s-owner', 'OwnerTester');
  player.accountId = 'acct-owner';
  player.accountLogin = 'owner-login';
  player.isGm = true;
  addItemsToPlayer(player, 'health_potion', 3);
  player.gold = 42;
  return player;
}

describe('OWNER_PLAYER_FIELDS (§52 #3)', () => {
  it('includes every PUBLIC_PLAYER_FIELDS entry', () => {
    for (const field of PUBLIC_PLAYER_FIELDS) {
      expect(OWNER_PLAYER_FIELDS).toContain(field);
    }
  });

  it('lists no field twice', () => {
    const set = new Set<string>(OWNER_PLAYER_FIELDS as readonly string[]);
    expect(set.size).toBe(OWNER_PLAYER_FIELDS.length);
  });

  it('does not include server-only persistence / bookkeeping fields', () => {
    for (const field of OWNER_PLAYER_FIELDS) {
      expect(PERSISTENCE_INTERNAL_FIELDS.has(field as string)).toBe(false);
    }
  });

  it('covers every PRIVATE_PLAYER_STATE_FIELDS entry that is not in PERSISTENCE_INTERNAL_FIELDS', () => {
    const ownerSet = new Set<string>(OWNER_PLAYER_FIELDS as readonly string[]);
    for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
      if (PERSISTENCE_INTERNAL_FIELDS.has(field as string)) continue;
      expect(ownerSet.has(field as string)).toBe(true);
    }
  });
});

describe('sanitizePlayerForOwner (§52 #3)', () => {
  it('returns an object containing only keys from OWNER_PLAYER_FIELDS', () => {
    const player = freshOwner();
    const snapshot = sanitizePlayerForOwner(player);
    for (const key of Object.keys(snapshot)) {
      expect(OWNER_PLAYER_FIELDS).toContain(key);
    }
  });

  it('drops server-internal fields even when present on the source', () => {
    const player = freshOwner();
    player.lastUpdateTime = 12345;
    player.lastSnapTime = 6789;
    player.positionDirty = true;
    player.lastRegenTimeMs = 4242;
    player.posHistory = [{ ts: 0, x: 0, z: 0 }];
    player.usedResurrectionThisLife = true;
    const snapshot = sanitizePlayerForOwner(player) as Record<string, unknown>;
    for (const field of PERSISTENCE_INTERNAL_FIELDS) {
      expect(snapshot, `expected ${field} to be stripped`).not.toHaveProperty(field);
    }
  });

  it('carries owner-bound progression + gold + skill state', () => {
    const player = freshOwner();
    player.experience = 80;
    player.experienceToNextLevel = 150;
    player.availableSkillPoints = 2;
    player.skillLevels = { fireball: 2 };
    const snapshot = sanitizePlayerForOwner(player);
    expect(snapshot.experience).toBe(80);
    expect(snapshot.experienceToNextLevel).toBe(150);
    expect(snapshot.availableSkillPoints).toBe(2);
    expect(snapshot.skillLevels).toEqual({ fireball: 2 });
    expect(snapshot.gold).toBe(42);
    expect(snapshot.isGm).toBe(true);
  });

  it('sanitizePlayerForPublic stays narrower than sanitizePlayerForOwner', () => {
    const player = freshOwner();
    const owner = sanitizePlayerForOwner(player);
    const pub = sanitizePlayerForPublic(player);
    expect(Object.keys(owner).length).toBeGreaterThan(Object.keys(pub).length);
    for (const key of Object.keys(pub)) {
      expect(owner).toHaveProperty(key);
    }
  });
});

describe('OwnerInventorySnapshot + OwnerEquipmentSnapshot (§52 #3)', () => {
  it('OwnerInventorySnapshot is structurally compatible with InventoryUpdateMsg payload', () => {
    const wire: InventoryUpdateMsg = {
      type: 'InventoryUpdate',
      playerId: 'p1',
      inventory: [{ itemId: 'health_potion', quantity: 3 }],
      maxInventorySlots: 20,
    };
    const snapshot: OwnerInventorySnapshot = {
      playerId: wire.playerId,
      inventory: wire.inventory,
      maxInventorySlots: wire.maxInventorySlots,
    };
    expect(snapshot.inventory).toEqual(wire.inventory);
    expect(snapshot.maxInventorySlots).toBe(wire.maxInventorySlots);
  });

  it('OwnerEquipmentSnapshot is structurally compatible with EquipmentUpdateMsg payload', () => {
    const wire: EquipmentUpdateMsg = {
      type: 'EquipmentUpdate',
      equipment: [{ slot: 'CHEST', itemId: 'leather_tunic' }],
    };
    const snapshot: OwnerEquipmentSnapshot = { equipment: wire.equipment };
    expect(snapshot.equipment).toEqual(wire.equipment);
  });
});
