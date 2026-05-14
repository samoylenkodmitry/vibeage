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

  constructor() {
    super();
    this.revision = 0;
    this.playerCount = 0;
    this.enemyCount = 0;
    this.aliveEnemyCount = 0;
    this.activeRegionCount = 0;
    this.regionCount = 0;
    this.regions = new MapSchema<PublicWorldRegionState>();
  }
}

defineTypes(VibeAgePublicState, {
  revision: 'number',
  playerCount: 'number',
  enemyCount: 'number',
  aliveEnemyCount: 'number',
  activeRegionCount: 'number',
  regionCount: 'number',
  regions: { map: PublicWorldRegionState },
});

export function createVibeAgePublicState(): VibeAgePublicState {
  return new VibeAgePublicState();
}

export function syncVibeAgePublicState(
  publicState: VibeAgePublicState,
  gameState: GameState,
  regions: readonly ServerWorldRegion[],
): void {
  const enemies = Object.values(gameState.enemies);
  const regionStats = getWorldRegionStats(gameState, regions);

  publicState.revision += 1;
  publicState.playerCount = Object.keys(gameState.players).length;
  publicState.enemyCount = enemies.length;
  publicState.aliveEnemyCount = enemies.filter((enemy) => enemy.isAlive).length;
  publicState.activeRegionCount = regionStats.filter((region) => region.active).length;
  publicState.regionCount = regionStats.length;

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
