import { describe, expect, test, vi } from 'vitest';
import { handleEquipItem, handleUnequipItem } from '../server/inventory/equipHandlers';
import { recomputePlayerStats } from '../server/players/playerStatsRefresh';
import { addItemsToPlayer } from '../server/inventory/aggregateBridge';
import { createTransientPlayer } from '../server/playerFactory';

function freshPlayer() {
  const player = createTransientPlayer('socket-1', 'TesterPlayer');
  // Tests in this file equip A/S-grade content (celestial_staff etc.);
  // bump the level above GRADE_MIN_LEVEL.s (68) so the grade gate
  // doesn't reject. Suite is about the equip flow + stats, not the
  // gate itself — gearGradeGate.spec.ts covers the gate.
  player.level = 80;
  // Re-derive stats now that the level changed so dmgBefore captures
  // the level-80 baseline (not the level-1 default from
  // createTransientPlayer). Otherwise equip/unequip refresh leaves
  // the stats at a higher number than the captured baseline.
  recomputePlayerStats(player);
  // Start with an empty bag so tests control exactly what's in slot 0.
  player.inventory = [];
  if (player.characterInventory) {
    player.characterInventory.items = {};
    player.characterInventory.equipment = {};
    player.characterInventory.occupancy = {};
  }
  return player;
}

function captureSink() {
  const sent: Array<{ type: string; [key: string]: unknown }> = [];
  return {
    sink: { send: (msg: { type: string; [key: string]: unknown }) => sent.push(msg) },
    sent,
  };
}

describe('equip handler flow', () => {
  test('equipping a worn_sword via inventory slot 0 places it in MAIN_HAND', () => {
    const player = freshPlayer();
    expect(addItemsToPlayer(player, 'worn_sword', 1).ok).toBe(true);
    const { sink, sent } = captureSink();

    handleEquipItem(player, { type: 'EquipItem', slotIndex: 0 }, sink);

    expect(player.characterInventory?.equipment.MAIN_HAND).toBeDefined();
    const equipMsg = sent.find((msg) => msg.type === 'EquipmentUpdate');
    expect(equipMsg).toBeDefined();
  });

  test('equipping a high pAtk weapon bumps the player damage multiplier', () => {
    const player = freshPlayer();
    expect(addItemsToPlayer(player, 'celestial_staff', 1).ok).toBe(true);
    const baselineDmg = player.stats?.dmgMult ?? 0;
    const { sink } = captureSink();

    handleEquipItem(player, { type: 'EquipItem', slotIndex: 0 }, sink);

    expect(player.characterInventory?.equipment.MAIN_HAND).toBeDefined();
    expect(player.stats?.dmgMult).toBeGreaterThan(baselineDmg);
  });

  test('unequipping returns the item to the bag and resets dmgMult', () => {
    const player = freshPlayer();
    expect(addItemsToPlayer(player, 'flame_blade', 1).ok).toBe(true);
    const dmgBefore = player.stats?.dmgMult ?? 0;
    const sink = { send: vi.fn() };
    handleEquipItem(player, { type: 'EquipItem', slotIndex: 0 }, sink);
    const dmgEquipped = player.stats?.dmgMult ?? 0;
    expect(dmgEquipped).toBeGreaterThan(dmgBefore);

    handleUnequipItem(player, { type: 'UnequipItem', slot: 'MAIN_HAND' }, sink);
    expect(player.characterInventory?.equipment.MAIN_HAND).toBeUndefined();
    expect(player.stats?.dmgMult).toBeCloseTo(dmgBefore, 5);
  });

  test('refreshing stats with no equipment is a no-op compared to baseline', () => {
    const player = freshPlayer();
    const before = { ...player.stats };
    recomputePlayerStats(player);
    expect(player.stats?.dmgMult).toBeCloseTo(before.dmgMult ?? 0, 5);
  });

  test('equipping an invalid bag slot emits CommandRejected and does not mutate stats (§52 #1: EquipFailed retired)', () => {
    const player = freshPlayer();
    const dmgBefore = player.stats?.dmgMult ?? 0;
    const { sink, sent } = captureSink();
    handleEquipItem(player, { type: 'EquipItem', slotIndex: 99 }, sink);
    expect(sent.some((msg) => msg.type === 'CommandRejected' && (msg as { commandType?: string }).commandType === 'EquipItem')).toBe(true);
    expect(sent.some((msg) => msg.type === 'EquipFailed')).toBe(false);
    expect(player.stats?.dmgMult).toBeCloseTo(dmgBefore, 5);
  });
});
