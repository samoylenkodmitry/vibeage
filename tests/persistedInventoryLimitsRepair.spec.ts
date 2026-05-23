import { describe, expect, test } from 'vitest';
import { hydratePersistedCharacterInventory } from '../server/inventory/aggregateBridge';
import type { PlayerState } from '../packages/sim/entities';
import { maxInventorySlotCount } from '../packages/sim/characterInventory';

/**
 * Account 'a/a' regression — a persisted inventory aggregate is
 * allowed to be missing or wrong on the `limits` field. Without
 * repair, `maxInventorySlotCount` returns 0 or NaN, every `addItems`
 * call rejects with `inventoryFull`, and the player can't pick up
 * anything ever (drop succeeds because it doesn't check slot cap;
 * pickup fails because it does). The "Your bag is full" combat-log
 * line surfaces this in the UI.
 *
 * `hydratePersistedCharacterInventory` must repair the limits using
 * `player.maxInventorySlots` as the source of truth so legacy /
 * malformed rows recover transparently on join.
 */

function makePlayer(maxInventorySlots = 20): PlayerState {
  return {
    id: 'a', socketId: 's', name: 'a',
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100, mana: 100, maxMana: 100,
    className: 'mage', unlockedSkills: [], skillShortcuts: [],
    availableSkillPoints: 0, skillCooldownEndTs: {}, statusEffects: [],
    level: 1, experience: 0, experienceToNextLevel: 100,
    castingSkill: null, castingProgressMs: 0, isAlive: true,
    maxInventorySlots,
  } as PlayerState;
}

describe('hydratePersistedCharacterInventory repairs broken limits', () => {
  test('missing limits → seeded from player.maxInventorySlots', () => {
    const player = makePlayer(20);
    const raw = {
      characterId: 'a',
      items: {},
      equipment: {},
      occupancy: {},
      // limits absent — older row.
    };
    hydratePersistedCharacterInventory(player, raw);
    expect(player.characterInventory).toBeDefined();
    expect(maxInventorySlotCount(player.characterInventory!.limits)).toBe(20);
  });

  test('zero baseSlots → repaired to player.maxInventorySlots', () => {
    const player = makePlayer(20);
    const raw = {
      characterId: 'a',
      items: {},
      equipment: {},
      occupancy: {},
      limits: { baseSlots: 0, bonusSlots: 0, maxWeight: 80_000 },
    };
    hydratePersistedCharacterInventory(player, raw);
    expect(maxInventorySlotCount(player.characterInventory!.limits)).toBe(20);
  });

  test('NaN baseSlots → repaired to player.maxInventorySlots', () => {
    const player = makePlayer(20);
    const raw = {
      characterId: 'a',
      items: {},
      equipment: {},
      occupancy: {},
      limits: { baseSlots: NaN, bonusSlots: 0, maxWeight: 80_000 },
    };
    hydratePersistedCharacterInventory(player, raw);
    expect(maxInventorySlotCount(player.characterInventory!.limits)).toBe(20);
  });

  test('valid limits are preserved as-is', () => {
    const player = makePlayer(20);
    const raw = {
      characterId: 'a',
      items: {},
      equipment: {},
      occupancy: {},
      limits: { baseSlots: 24, bonusSlots: 6, maxWeight: 100_000 },
    };
    hydratePersistedCharacterInventory(player, raw);
    expect(player.characterInventory!.limits).toEqual({
      baseSlots: 24,
      bonusSlots: 6,
      maxWeight: 100_000,
    });
    expect(maxInventorySlotCount(player.characterInventory!.limits)).toBe(30);
  });
});
