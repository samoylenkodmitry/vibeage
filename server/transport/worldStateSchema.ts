import { MapSchema, Schema, defineTypes } from '@colyseus/schema';
import type { GameState } from '../gameState.js';
import type { ServerWorldRegion } from '../world/regions.js';
import { getWorldRegionStats } from '../world/regions.js';

export class PublicWorldRegionState extends Schema {
  declare id: string;
  declare zoneId: string;
  declare name: string;
  declare active: boolean;
  declare playerCount: number;
  declare enemyCount: number;
  declare aliveEnemyCount: number;
  declare maxEnemies: number;

  constructor() {
    super();
    this.id = '';
    this.zoneId = '';
    this.name = '';
    this.active = false;
    this.playerCount = 0;
    this.enemyCount = 0;
    this.aliveEnemyCount = 0;
    this.maxEnemies = 0;
  }
}

defineTypes(PublicWorldRegionState, {
  id: 'string',
  zoneId: 'string',
  name: 'string',
  active: 'boolean',
  playerCount: 'number',
  enemyCount: 'number',
  aliveEnemyCount: 'number',
  maxEnemies: 'number',
});

export class VibeAgePublicState extends Schema {
  declare revision: number;
  declare playerCount: number;
  declare enemyCount: number;
  declare aliveEnemyCount: number;
  declare activeRegionCount: number;
  declare regionCount: number;
  declare regions: MapSchema<PublicWorldRegionState>;
  declare players: MapSchema<PublicPlayerPresenceState>;

  constructor() {
    super();
    this.revision = 0;
    this.playerCount = 0;
    this.enemyCount = 0;
    this.aliveEnemyCount = 0;
    this.activeRegionCount = 0;
    this.regionCount = 0;
    this.regions = new MapSchema<PublicWorldRegionState>();
    this.players = new MapSchema<PublicPlayerPresenceState>();
  }
}

export class PublicPlayerPresenceState extends Schema {
  declare id: string;
  declare name: string;
  declare className: string;
  declare level: number;
  declare isAlive: boolean;
  declare regionId: string;

  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.className = '';
    this.level = 1;
    this.isAlive = false;
    this.regionId = '';
  }
}

defineTypes(PublicPlayerPresenceState, {
  id: 'string',
  name: 'string',
  className: 'string',
  level: 'number',
  isAlive: 'boolean',
  regionId: 'string',
});

defineTypes(VibeAgePublicState, {
  revision: 'number',
  playerCount: 'number',
  enemyCount: 'number',
  aliveEnemyCount: 'number',
  activeRegionCount: 'number',
  regionCount: 'number',
  regions: { map: PublicWorldRegionState },
  players: { map: PublicPlayerPresenceState },
});

export function createVibeAgePublicState(): VibeAgePublicState {
  return new VibeAgePublicState();
}

export function syncVibeAgePublicState(
  publicState: VibeAgePublicState,
  gameState: GameState,
  regions: readonly ServerWorldRegion[],
): void {
  const counts = getPublicEntityCounts(gameState);
  const regionStats = getWorldRegionStats(gameState, regions);

  publicState.revision += 1;
  publicState.playerCount = counts.playerCount;
  publicState.enemyCount = counts.enemyCount;
  publicState.aliveEnemyCount = counts.aliveEnemyCount;
  publicState.activeRegionCount = regionStats.filter((region) => region.active).length;
  publicState.regionCount = regionStats.length;

  syncPublicPlayerPresence(publicState.players, gameState);
  const nextRegionIds = new Set(regionStats.map((region) => region.id));
  for (const regionId of publicState.regions.keys()) {
    if (!nextRegionIds.has(regionId)) {
      publicState.regions.delete(regionId);
    }
  }

  for (const region of regionStats) {
    const regionState = publicState.regions.get(region.id) ?? new PublicWorldRegionState();
    regionState.id = region.id;
    regionState.zoneId = region.zoneId;
    regionState.name = region.name;
    regionState.active = region.active;
    regionState.playerCount = region.playerCount;
    regionState.enemyCount = region.enemyCount;
    regionState.aliveEnemyCount = region.aliveEnemyCount;
    regionState.maxEnemies = region.maxEnemies;
    publicState.regions.set(region.id, regionState);
  }
}

function getPublicEntityCounts(gameState: GameState): {
  playerCount: number;
  enemyCount: number;
  aliveEnemyCount: number;
} {
  let playerCount = 0;
  for (const playerId in gameState.players) {
    if (Object.prototype.hasOwnProperty.call(gameState.players, playerId)) {
      playerCount += 1;
    }
  }

  let enemyCount = 0;
  let aliveEnemyCount = 0;
  for (const enemyId in gameState.enemies) {
    if (!Object.prototype.hasOwnProperty.call(gameState.enemies, enemyId)) {
      continue;
    }

    enemyCount += 1;
    if (gameState.enemies[enemyId].isAlive) {
      aliveEnemyCount += 1;
    }
  }

  return { playerCount, enemyCount, aliveEnemyCount };
}

function syncPublicPlayerPresence(
  target: MapSchema<PublicPlayerPresenceState>,
  gameState: GameState,
): void {
  deleteMissingMapEntries(target, gameState.players);

  for (const playerId in gameState.players) {
    if (!Object.prototype.hasOwnProperty.call(gameState.players, playerId)) {
      continue;
    }

    const player = gameState.players[playerId];
    const playerState = target.get(playerId) ?? new PublicPlayerPresenceState();
    playerState.id = player.id;
    playerState.name = player.name;
    playerState.className = player.className;
    playerState.level = player.level;
    playerState.isAlive = player.isAlive;
    playerState.regionId = gameState.zones.playerZoneIds[playerId] ?? '';
    target.set(playerId, playerState);
  }
}

function deleteMissingMapEntries<T extends Schema>(
  target: MapSchema<T>,
  source: Record<string, unknown>,
): void {
  for (const id of target.keys()) {
    if (!Object.prototype.hasOwnProperty.call(source, id)) {
      target.delete(id);
    }
  }
}
