import type {
  EnemyEntity,
  GameClientState,
  GroundLootStack,
  PlayerEntity,
  ServerGameState,
} from './gameTypes';
import { normalizeClientStarterProgress } from './starterProgress';
import { normalizeVec3 } from './vec3';

export function applyGameStateSnapshot(state: GameClientState, serverState: ServerGameState): GameClientState {
  const players = serverState.players ?? {};
  const enemies = serverState.enemies ?? {};
  const selectedTargetId = enemies[state.selectedTargetId ?? ''] ? state.selectedTargetId : null;
  const inventory = state.myPlayerId ? players[state.myPlayerId]?.inventory ?? state.inventory : state.inventory;
  const maxInventorySlots = state.myPlayerId
    ? players[state.myPlayerId]?.maxInventorySlots ?? state.maxInventorySlots
    : state.maxInventorySlots;
  const groundLoot = normalizeGroundLoot(serverState.groundLoot ?? state.groundLoot);
  const myPlayer = state.myPlayerId ? players[state.myPlayerId] : null;
  const starterProgress = myPlayer
    ? normalizeClientStarterProgress(myPlayer.starterProgress ?? state.starterProgress, myPlayer)
    : state.starterProgress;
  const streamedRegionIds = deriveStreamedRegionIds(serverState, players, enemies);

  return {
    ...state,
    players,
    enemies,
    groundLoot,
    selectedTargetId,
    inventory,
    maxInventorySlots,
    starterProgress,
    streamedRegionIds,
  };
}

function deriveStreamedRegionIds(
  serverState: ServerGameState,
  players: Record<string, PlayerEntity>,
  enemies: Record<string, EnemyEntity>,
): string[] {
  const regionIds = new Set<string>();

  for (const playerId of Object.keys(players)) {
    const regionId = serverState.zones?.playerZoneIds?.[playerId];
    if (regionId) {
      regionIds.add(regionId);
    }
  }

  for (const enemyId of Object.keys(enemies)) {
    const regionId = serverState.zones?.enemyZoneIds?.[enemyId];
    if (regionId) {
      regionIds.add(regionId);
    }
  }

  return [...regionIds].sort();
}

function normalizeGroundLoot(
  groundLoot: ServerGameState['groundLoot'] | Record<string, GroundLootStack>,
): Record<string, GroundLootStack> {
  return Object.fromEntries(
    Object.entries(groundLoot ?? {}).map(([id, loot]) => [
      id,
      {
        id,
        position: normalizeVec3(loot.position),
        items: loot.items,
      },
    ]),
  );
}
