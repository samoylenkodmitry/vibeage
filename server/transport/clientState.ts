import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { PlayerUpdate } from './outboundEvents.js';
import {
  getEnemiesInActiveRegions,
  getEntityRegionId,
  getPlayerStreamRegionIds,
  getPositionRegionId,
  type ServerWorldRegion,
} from '../world/regions.js';

export const PRIVATE_PLAYER_STATE_FIELDS = [
  'socketId',
  'starterProgress',
  'inventory',
  'maxInventorySlots',
  // Owner-only: the full instance-aware bag + equipped slot map. Other
  // players must only see a public equipment-visual DTO (planned), never
  // every item instance the owner has.
  'characterInventory',
  // Owner-only: quest progress isn't shown to nearby players. Other
  // people seeing your quest log would surface griefable info ("they
  // need to kill 3 more goblins; let me intervene").
  'questState',
  // PR GG — gold is the owner's wallet; nearby players don't need to
  // see how much you're carrying (and seeing it would let griefers
  // ping rich targets).
  'gold',
] as const;
export const CLIENT_GAME_STATE_FIELDS = [
  'players',
  'enemies',
  'groundLoot',
  'zones',
] as const satisfies ReadonlyArray<keyof GameState>;

type PrivatePlayerStateField = typeof PRIVATE_PLAYER_STATE_FIELDS[number];
export type PublicPlayerState = Omit<PlayerState, PrivatePlayerStateField>;
export type ClientPlayerState = PlayerState | PublicPlayerState;
export type ClientGameStateSnapshot = Pick<GameState, 'enemies' | 'groundLoot' | 'zones'> & {
  players: Record<string, ClientPlayerState>;
};

export function makeClientGameStateSnapshot(
  state: GameState,
  socketId: string,
  regions?: readonly ServerWorldRegion[],
): ClientGameStateSnapshot {
  const visibleRegionIds = regions ? getPlayerStreamRegionIds(state, regions, socketId) : null;
  const players = makeClientPlayersSnapshot(state, socketId, regions, visibleRegionIds);
  const enemies = makeClientEnemiesSnapshot(state, regions, visibleRegionIds);
  const groundLoot = makeClientGroundLootSnapshot(state, regions, visibleRegionIds);

  return {
    players,
    enemies,
    groundLoot,
    zones: makeClientZonesSnapshot(state, players, enemies),
  };
}

export function sanitizePlayerForPublic(player: PlayerState): PublicPlayerState {
  const publicPlayer = { ...player };
  deletePrivatePlayerState(publicPlayer);
  return publicPlayer as PublicPlayerState;
}

export function sanitizePlayerUpdateForPublic(update: PlayerUpdate): PlayerUpdate {
  const publicUpdate = { ...update };
  deletePrivatePlayerState(publicUpdate);
  return publicUpdate;
}

function deletePrivatePlayerState(player: Partial<PlayerState>): void {
  for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
    delete player[field];
  }
}

function makeClientPlayersSnapshot(
  state: GameState,
  socketId: string,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
): ClientGameStateSnapshot['players'] {
  return Object.fromEntries(
    Object.entries(state.players)
      .filter(([playerId, player]) => player.socketId === socketId || isEntityInScope(state, regions, visibleRegionIds, playerId))
      .map(([playerId, player]) => [
        playerId,
        player.socketId === socketId ? player : sanitizePlayerForPublic(player),
      ]),
  ) as ClientGameStateSnapshot['players'];
}

function makeClientEnemiesSnapshot(
  state: GameState,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
): GameState['enemies'] {
  if (!regions || !visibleRegionIds) {
    return getEnemiesInActiveRegions(state);
  }

  return Object.fromEntries(
    Object.entries(state.enemies).filter(([enemyId]) => isEntityInScope(state, regions, visibleRegionIds, enemyId)),
  );
}

function makeClientGroundLootSnapshot(
  state: GameState,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
): GameState['groundLoot'] {
  if (!regions || !visibleRegionIds) {
    return state.groundLoot;
  }

  return Object.fromEntries(
    Object.entries(state.groundLoot).filter(([, loot]) => isRegionInScope(
      getPositionRegionId(regions, loot.position),
      visibleRegionIds,
    )),
  );
}

function makeClientZonesSnapshot(
  state: GameState,
  players: ClientGameStateSnapshot['players'],
  enemies: GameState['enemies'],
): GameState['zones'] {
  const playerIds = new Set(Object.keys(players));
  const enemyIds = new Set(Object.keys(enemies));

  return {
    activeZoneIds: state.zones.activeZoneIds,
    playerZoneIds: Object.fromEntries(
      Object.entries(state.zones.playerZoneIds).filter(([playerId]) => playerIds.has(playerId)),
    ),
    enemyZoneIds: Object.fromEntries(
      Object.entries(state.zones.enemyZoneIds).filter(([enemyId]) => enemyIds.has(enemyId)),
    ),
  };
}

function isEntityInScope(
  state: GameState,
  regions: readonly ServerWorldRegion[] | undefined,
  visibleRegionIds: ReadonlySet<string> | null,
  entityId: string,
): boolean {
  if (!regions || !visibleRegionIds) {
    return true;
  }

  return isRegionInScope(getEntityRegionId(state, regions, entityId), visibleRegionIds);
}

function isRegionInScope(regionId: string | undefined, visibleRegionIds: ReadonlySet<string>): boolean {
  return Boolean(regionId && visibleRegionIds.has(regionId));
}
