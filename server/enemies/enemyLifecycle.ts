import { getEnemyTemplate } from '../../packages/content/enemies.js';
import { getTerrainHeight } from '../../packages/content/terrain.js';
import type { MobSpawnConfig, ZoneManager, ZoneMiniBoss } from '../../packages/content/zones.js';
import { WORLD_SPAWN_BUDGETS } from '../../packages/content/zoneSpawnBudget.js';
import { hash, rng } from '../../packages/sim/combatMath.js';
import type { Enemy } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitEnemyUpdated, type OutboundEventSink } from '../transport/outboundEvents.js';

const PACK_CLUSTER_RADIUS = 4;

export const ENEMY_RESPAWN_DELAY_MS = 30_000;

export { DEFAULT_BOSS_CONFIG } from '../../packages/content/miniBosses.js';
import { DEFAULT_BOSS_CONFIG } from '../../packages/content/miniBosses.js';

export type SpawnInitialEnemiesOptions = {
  activeZoneIds?: readonly string[];
  maxEnemies?: number;
  maxEnemiesPerZone?: number;
};

export type CreateEnemyOptions = {
  packId?: string;
  isMiniBoss?: boolean;
  bossId?: string;
  nameOverride?: string;
  healthMultiplier?: number;
  damageMultiplier?: number;
  experienceMultiplier?: number;
  lootTableIdOverride?: string;
};

export function createEnemy(
  type: string,
  level: number,
  position: Enemy['position'],
  now: number = Date.now(),
  options: CreateEnemyOptions = {},
): Enemy {
  const template = getEnemyTemplate(type);
  const healthMult = options.healthMultiplier ?? 1;
  const damageMult = options.damageMultiplier ?? 1;
  const expMult = options.experienceMultiplier ?? (options.isMiniBoss ? 4 : 1);
  const baseHealth = (100 + level * 20) * template.stats.health * healthMult;
  const baseExp = (50 + level * 10) * template.stats.experience * expMult;
  const attackDamage = (10 + level * 2) * template.stats.damage * damageMult;
  const movementSpeed = 6 * template.stats.movementSpeed;
  return {
    id: `${type}-${hash(`${type}-${now}-${position.x}-${position.z}`).toString(36).substring(0, 9)}`,
    type,
    name: options.nameOverride ?? template.displayName,
    level,
    position,
    spawnPosition: { ...position },
    rotation: { x: 0, y: rng(hash(`rotation-${now}-${position.x}-${position.z}`))() * Math.PI * 2, z: 0 },
    health: baseHealth,
    maxHealth: baseHealth,
    isAlive: true,
    attackDamage,
    attackRange: 2 * template.stats.attackRange,
    baseExperienceValue: baseExp,
    experienceValue: baseExp,
    statusEffects: [],
    targetId: null,
    aiState: 'idle',
    aggroRadius: 15 * template.stats.aggroRadius,
    attackCooldownMs: 2000 * template.stats.attackCooldownMs,
    lastAttackTime: 0,
    movementSpeed,
    velocity: { x: 0, z: 0 },
    lootTableId: options.lootTableIdOverride ?? template.lootTableId ?? `${type}_loot`,
    packId: options.packId,
    isMiniBoss: options.isMiniBoss,
    bossId: options.bossId,
    ...(options.isMiniBoss
      ? {
          baseAttackDamage: attackDamage,
          baseMovementSpeed: movementSpeed,
          bossConfig: { ...DEFAULT_BOSS_CONFIG },
        }
      : {}),
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

    const miniBoss = zoneManager.getMiniBoss(zoneId);
    if (miniBoss && spawned < maxEnemies && spawnedInZone < maxEnemiesPerZone) {
      // PR V — honour an explicit `position` on the miniBoss spec
      // (so Vorthax always spawns on the caldera, not a random rock
      // in the peaks). Falls back to a random in-zone point.
      const position = miniBoss.position
        ? { ...miniBoss.position }
        : zoneManager.getRandomPositionInZone(zoneId);
      if (position) {
        const zoneBaseLevel = zoneManager.getMobLevel(zoneId);
        const enemy = createMiniBoss(miniBoss, zoneBaseLevel, position);
        state.enemies[enemy.id] = enemy;
        state.zones.enemyZoneIds[enemy.id] = zoneId;
        spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });
        spawned += 1;
        spawnedInZone += 1;
      }
    }

    for (const mobConfig of zoneManager.getMobsToSpawn(zoneId)) {
      const zoneBudgetRemaining = maxEnemiesPerZone - spawnedInZone;
      const worldBudgetRemaining = maxEnemies - spawned;
      const spawnCount = Math.min(mobConfig.count, zoneBudgetRemaining, worldBudgetRemaining);
      const result = spawnMobBatch(state, spatial, zoneManager, zoneId, mobConfig, spawnCount);
      spawned += result;
      spawnedInZone += result;

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

function createMiniBoss(
  miniBoss: ZoneMiniBoss,
  zoneBaseLevel: number,
  position: Enemy['position'],
): Enemy {
  return createEnemy(miniBoss.type, zoneBaseLevel + (miniBoss.levelBonus ?? 2), position, Date.now(), {
    isMiniBoss: true,
    bossId: miniBoss.id,
    nameOverride: miniBoss.name,
    healthMultiplier: miniBoss.healthMultiplier ?? 3,
    damageMultiplier: miniBoss.damageMultiplier ?? 1.5,
    lootTableIdOverride: miniBoss.lootTableId,
  });
}

function spawnMobBatch(
  state: GameState,
  spatial: SpatialHashGrid,
  zoneManager: ZoneManager,
  zoneId: string,
  mobConfig: MobSpawnConfig,
  spawnCount: number,
): number {
  let spawned = 0;
  const packSize = mobConfig.packSize ?? 1;
  while (spawned < spawnCount) {
    const remaining = spawnCount - spawned;
    const groupSize = Math.min(packSize, remaining);
    const center = zoneManager.getRandomPositionInZone(zoneId);
    if (!center) {
      break;
    }
    const packId = groupSize > 1 ? `pack-${zoneId}-${mobConfig.type}-${spawned}-${Date.now()}` : undefined;
    for (let i = 0; i < groupSize; i += 1) {
      const position = packId ? clusterAround(center, i) : center;
      const enemy = createEnemy(mobConfig.type, zoneManager.getMobLevel(zoneId), position, Date.now(), { packId });
      state.enemies[enemy.id] = enemy;
      state.zones.enemyZoneIds[enemy.id] = zoneId;
      spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });
      spawned += 1;
    }
  }
  return spawned;
}

function clusterAround(center: Enemy['position'], offsetIndex: number): Enemy['position'] {
  if (offsetIndex === 0) {
    return { ...center };
  }
  const angle = (offsetIndex / 6) * Math.PI * 2;
  const radius = PACK_CLUSTER_RADIUS * (0.4 + Math.random() * 0.6);
  const x = center.x + Math.cos(angle) * radius;
  const z = center.z + Math.sin(angle) * radius;
  return { x, y: getTerrainHeight(x, z) + 0.5, z };
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
