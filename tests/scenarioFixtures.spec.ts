import { describe, expect, test } from 'vitest';
import { makeClientGameStateSnapshot } from '../server/transport/clientState';
import { getPlayerStreamRegionIds } from '../server/world/regions';
import { playerInventorySlots } from './helpers/inventoryView';
import {
  createCombatEncounterScenario,
  createFullInventoryScenario,
  createLootPickupScenario,
  createPersistedPlayerReconnectScenario,
  createScopedRegionStreamingScenario,
  createTwoPlayersInRegionsScenario,
  SCENARIO_REGION_A,
  SCENARIO_REGION_B,
} from './helpers/scenarioFixtures';

describe('scenario fixtures', () => {
  test('creates two players in separate streaming regions', () => {
    const { state, regions, playerA, playerB } = createTwoPlayersInRegionsScenario();

    expect(state.zones.playerZoneIds).toEqual({
      [playerA.id]: SCENARIO_REGION_A,
      [playerB.id]: SCENARIO_REGION_B,
    });
    expect([...getPlayerStreamRegionIds(state, regions, playerA.socketId)]).toEqual([SCENARIO_REGION_A]);
  });

  test('creates a combat encounter indexed in spatial state', () => {
    const { spatial, player, enemy } = createCombatEncounterScenario();

    expect(enemy.targetId).toBe(player.id);
    expect(spatial.queryCircle({ x: 0, z: 0 }, 10)).toEqual(expect.arrayContaining([player.id, enemy.id]));
  });

  test('creates nearby loot pickup state', () => {
    const { state, player, lootId, loot } = createLootPickupScenario();

    expect(state.players[player.id]).toBe(player);
    expect(state.groundLoot[lootId].items).toEqual(loot);
  });

  test('creates a full inventory state', () => {
    const { player } = createFullInventoryScenario(3);

    expect(playerInventorySlots(player)).toHaveLength(3);
    expect(player.maxInventorySlots).toBe(3);
  });

  test('creates relogged persisted player state', () => {
    const { beforeRelog, afterRelog } = createPersistedPlayerReconnectScenario();

    expect(afterRelog).toMatchObject({
      id: beforeRelog.id,
      socketId: 'new-socket',
      position: beforeRelog.position,
      // basicAttack + escape + class auto-passive are appended on
      // hydrate (universal-skills + PR PP class passive backfill).
      // beforeRelog is mage → passive_arcane_focus.
      unlockedSkills: [...beforeRelog.unlockedSkills, 'basicAttack', 'escape', 'passive_arcane_focus'],
    });
    expect(playerInventorySlots(afterRelog)).toEqual(playerInventorySlots(beforeRelog));
  });

  test('creates scoped region streaming state', () => {
    const { state, regions, localPlayer, localEnemy } = createScopedRegionStreamingScenario();

    const snapshot = makeClientGameStateSnapshot(state, localPlayer.socketId, regions);

    expect(Object.keys(snapshot.players)).toEqual([localPlayer.id]);
    expect(Object.keys(snapshot.enemies)).toEqual([localEnemy.id]);
    expect(Object.keys(snapshot.groundLoot)).toEqual(['local']);
    expect(snapshot.zones.enemyZoneIds).toEqual({ [localEnemy.id]: SCENARIO_REGION_A });
  });
});
