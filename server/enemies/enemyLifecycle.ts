import type { ZoneManager } from '../../packages/content/zones.js';
import { WORLD_SPAWN_BUDGETS } from '../../packages/content/zoneSpawnBudget.js';
import { hash, rng } from '../../packages/sim/combatMath.js';
import type { Enemy } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitEnemyUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';

export const ENEMY_RESPAWN_DELAY_MS = 30_000;

export type SpawnInitialEnemiesOptions = {
  activeZoneIds?: readonly string[];
  maxEnemies?: number;
  maxEnemiesPerZone?: number;
};

export function createEnemy(
  type: string,
  level: number,
  position: Enemy['position'],
  now: number = Date.now(),
): Enemy {
  return {
    id: `${type}-${hash(`${type}-${now}-${position.x}-${position.z}`).toString(36).substring(0, 9)}`,
    type,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    level,
    position,
    spawnPosition: { ...position },
    rotation: { x: 0, y: rng(hash(`rotation-${now}-${position.x}-${position.z}`))() * Math.PI * 2, z: 0 },
    health: 100 + level * 20,
    maxHealth: 100 + level * 20,
    isAlive: true,
    attackDamage: 10 + level * 2,
    attackRange: 2,
    baseExperienceValue: 50 + level * 10,
    experienceValue: 50 + level * 10,
    statusEffects: [],
    targetId: null,
    aiState: 'idle',
    aggroRadius: 15,
    attackCooldownMs: 2000,
    lastAttackTime: 0,
    movementSpeed: 6,
    velocity: { x: 0, z: 0 },
    lootTableId: `${type}_loot`,
  };
}

export function spawnInitialEnemies(
  state: GameState,
  spatial: SpatialHashGrid,
  zoneManager: ZoneManager,
  options: SpawnInitialEnemiesOptions = {},
): number {
  const maxEnemies = options.maxEnemies ?? WORLD_SPAWN_BUDGETS.maxInitialEnemySpawns;
  const maxEnemiesPerZone = options.maxEnemiesPerZone ?? WORLD_SPAWN_BUDGETS.maxEnemiesPerZone;
  const activeZoneIds = options.activeZoneIds
    ?? (state.zones.activeZoneIds.length > 0
      ? state.zones.activeZoneIds
      : zoneManager.getZones().map((zone) => zone.id));
  let spawned = 0;

  for (const zoneId of activeZoneIds) {
    let spawnedInZone = 0;
    for (const mobConfig of zoneManager.getMobsToSpawn(zoneId)) {
      const zoneBudgetRemaining = maxEnemiesPerZone - spawnedInZone;
      const worldBudgetRemaining = maxEnemies - spawned;
      const spawnCount = Math.min(mobConfig.count, zoneBudgetRemaining, worldBudgetRemaining);
      for (let index = 0; index < spawnCount; index += 1) {
        const position = zoneManager.getRandomPositionInZone(zoneId);
        if (!position) {
          continue;
        }

        const enemy = createEnemy(mobConfig.type, zoneManager.getMobLevel(zoneId), position);
        state.enemies[enemy.id] = enemy;
        state.zones.enemyZoneIds[enemy.id] = zoneId;
        spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });
        spawned += 1;
        spawnedInZone += 1;
      }

      if (spawned >= maxEnemies || spawnedInZone >= maxEnemiesPerZone) {
        break;
      }
    }

    if (spawned >= maxEnemies) {
      return spawned;
    }
  }

  return spawned;
}

export function respawnDeadEnemies(
  state: GameState,
  spatial: SpatialHashGrid,
  outbound: OutboundEventSink,
  now: number = Date.now(),
): number {
  let respawned = 0;
  const activeZoneIds = new Set(state.zones.activeZoneIds);

  for (const [enemyId, enemy] of Object.entries(state.enemies)) {
    if (enemy.isAlive || enemy.deathTimeTs === undefined) {
      continue;
    }

    if (activeZoneIds.size > 0 && !activeZoneIds.has(state.zones.enemyZoneIds[enemyId])) {
      continue;
    }

    if (now - enemy.deathTimeTs < ENEMY_RESPAWN_DELAY_MS) {
      continue;
    }

    enemy.isAlive = true;
    enemy.health = enemy.maxHealth;
    enemy.position = { ...enemy.spawnPosition };
    enemy.targetId = null;
    enemy.statusEffects = [];

    spatial.insert(enemyId, { x: enemy.position.x, z: enemy.position.z });
    emitEnemyUpdated(outbound, enemy);
    respawned += 1;
  }

  return respawned;
}
