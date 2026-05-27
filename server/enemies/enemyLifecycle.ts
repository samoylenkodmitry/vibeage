import { DEFAULT_PACK_AGGRO_RADIUS_M, ENEMY_BASE_SCALING, getEnemyTemplate, resolveEnemyCombat } from '../../packages/content/enemies.js';
import { getTerrainHeight } from '../../packages/content/terrain.js';
import type { MobSpawnConfig, ZoneManager, ZoneMiniBoss } from '../../packages/content/zones.js';
import { WORLD_SPAWN_BUDGETS } from '../../packages/content/zoneSpawnBudget.js';
import { hash, rng } from '../../packages/sim/combatMath.js';
import type { Enemy } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import { emitEnemyUpdated, emitServerMessage, type OutboundEventSink } from '../transport/outboundEvents.js';

const PACK_CLUSTER_RADIUS = 4;

export const ENEMY_RESPAWN_DELAY_MS = 30_000;
// §11 mini-boss named encounter tracking — mini-bosses respawn on
// a much longer timer so the kill feels like a meaningful zone
// event, not a 30-second farming loop. Combined with the death /
// respawn ChatBroadcast emitted from targetDeath.ts +
// respawnDeadEnemies, players in any zone know when a mini-boss is
// down vs available.
export const MINI_BOSS_RESPAWN_DELAY_MS = 10 * 60_000;

function respawnDelayFor(enemy: { isMiniBoss?: boolean }): number {
  return enemy.isMiniBoss ? MINI_BOSS_RESPAWN_DELAY_MS : ENEMY_RESPAWN_DELAY_MS;
}

export { DEFAULT_BOSS_CONFIG } from '../../packages/content/miniBosses.js';
import { DEFAULT_BOSS_CONFIG, getMiniBossById } from '../../packages/content/miniBosses.js';

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
  now: number,
  options: CreateEnemyOptions = {},
): Enemy {
  const template = getEnemyTemplate(type);
  const healthMult = options.healthMultiplier ?? 1;
  const damageMult = options.damageMultiplier ?? 1;
  const expMult = options.experienceMultiplier ?? (options.isMiniBoss ? 4 : 1);
  // The mob power curve lives in content (ENEMY_BASE_SCALING); this just
  // evaluates `(flat + level*perLevel) × species-multiplier × option-mult`.
  const S = ENEMY_BASE_SCALING;
  const baseHealth = (S.health.flat + level * S.health.perLevel) * template.stats.health * healthMult;
  const baseExp = (S.experience.flat + level * S.experience.perLevel) * template.stats.experience * expMult;
  const attackDamage = (S.damage.flat + level * S.damage.perLevel) * template.stats.damage * damageMult;
  const movementSpeed = S.movementSpeed * template.stats.movementSpeed;
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
    // Spec-derived combat characteristics — the same `stats` shape a
    // player carries, so the damage/dodge systems read them uniformly.
    stats: { ...resolveEnemyCombat(template) },
    attackRange: S.attackRange * template.stats.attackRange,
    baseExperienceValue: baseExp,
    experienceValue: baseExp,
    statusEffects: [],
    targetId: null,
    aiState: 'idle',
    aggroRadius: S.aggroRadius * template.stats.aggroRadius,
    attackCooldownMs: S.attackCooldownMs * template.stats.attackCooldownMs,
    lastAttackTime: 0,
    movementSpeed,
    velocity: { x: 0, z: 0 },
    lootTableId: options.lootTableIdOverride ?? template.lootTableId ?? `${type}_loot`,
    packId: options.packId,
    packAggroRadius: DEFAULT_PACK_AGGRO_RADIUS_M * template.stats.packAggroRadius,
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
  now: number,
  options: SpawnInitialEnemiesOptions = {},
): number {
  const maxEnemies = options.maxEnemies ?? WORLD_SPAWN_BUDGETS.maxInitialEnemySpawns;
  const maxEnemiesPerZone = options.maxEnemiesPerZone ?? WORLD_SPAWN_BUDGETS.maxEnemiesPerZone;
  const activeZoneIds = options.activeZoneIds
    ?? (state.zones.activeZoneIds.length > 0
      ? state.zones.activeZoneIds
      : zoneManager.getZones().map((zone) => zone.id));
  let spawned = 0;
  // PR WW — track which zones we ran the initial spawn on so the
  // post-boot activation tick can spawn newly-active zones exactly
  // once (no doubles when a player re-enters the zone later).
  const spawnedSet = new Set<string>(state.zones.spawnedZoneIds);

  for (const zoneId of activeZoneIds) {
    let spawnedInZone = 0;
    spawnedSet.add(zoneId);
    // Deterministic per-zone spawn stream (count, level, miniboss
    // placement), seeded on the injected spawn tick — so a simulator
    // replay populates each zone identically with no ambient RNG.
    const zoneRng = rng(hash(`spawn:${zoneId}:${now}`));

    const miniBoss = zoneManager.getMiniBoss(zoneId, now);
    if (miniBoss && spawned < maxEnemies && spawnedInZone < maxEnemiesPerZone) {
      // PR V — honour an explicit `position` on the miniBoss spec
      // (so Vorthax always spawns on the caldera, not a random rock
      // in the peaks). Falls back to a random in-zone point.
      const position = miniBoss.position
        ? { ...miniBoss.position }
        : zoneManager.getRandomPositionInZone(zoneId, zoneRng);
      if (position) {
        const zoneBaseLevel = zoneManager.getMobLevel(zoneId, zoneRng);
        const enemy = createMiniBoss(miniBoss, zoneBaseLevel, position, now);
        state.enemies[enemy.id] = enemy;
        state.zones.enemyZoneIds[enemy.id] = zoneId;
        spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });
        spawned += 1;
        spawnedInZone += 1;
      }
    }

    for (const mobConfig of zoneManager.getMobsToSpawn(zoneId, now, zoneRng)) {
      const zoneBudgetRemaining = maxEnemiesPerZone - spawnedInZone;
      const worldBudgetRemaining = maxEnemies - spawned;
      const spawnCount = Math.min(mobConfig.count, zoneBudgetRemaining, worldBudgetRemaining);
      const result = spawnMobBatch({ state, spatial, zoneManager }, zoneId, mobConfig, spawnCount, now);
      spawned += result;
      spawnedInZone += result;

      if (spawned >= maxEnemies || spawnedInZone >= maxEnemiesPerZone) {
        break;
      }
    }

    if (spawned >= maxEnemies) {
      state.zones.spawnedZoneIds = [...spawnedSet];
      return spawned;
    }
  }

  state.zones.spawnedZoneIds = [...spawnedSet];
  return spawned;
}

function createMiniBoss(
  miniBoss: ZoneMiniBoss,
  zoneBaseLevel: number,
  position: Enemy['position'],
  now: number,
): Enemy {
  return createEnemy(miniBoss.type, zoneBaseLevel + (miniBoss.levelBonus ?? 2), position, now, {
    isMiniBoss: true,
    bossId: miniBoss.id,
    nameOverride: miniBoss.name,
    healthMultiplier: miniBoss.healthMultiplier ?? 3,
    damageMultiplier: miniBoss.damageMultiplier ?? 1.5,
    lootTableIdOverride: miniBoss.lootTableId,
  });
}

const DEFAULT_MOB_SPAWN_RADIUS = 8;

function spawnMobBatch(
  world: { state: GameState; spatial: SpatialHashGrid; zoneManager: ZoneManager },
  zoneId: string,
  mobConfig: MobSpawnConfig,
  spawnCount: number,
  now: number,
): number {
  const { state, spatial, zoneManager } = world;
  let spawned = 0;
  const packSize = mobConfig.packSize ?? 1;
  // Deterministic spawn-jitter stream, seeded per (zone, type, tick) so
  // a simulator replay places mobs identically. No wall clock, no
  // ambient Math.random.
  const rand = rng(hash(`${zoneId}:${mobConfig.type}:${now}`));
  while (spawned < spawnCount) {
    const remaining = spawnCount - spawned;
    const groupSize = Math.min(packSize, remaining);
    // PR FF — when the ZoneMob spec carries an explicit `position`,
    // jitter around that anchor (and for packs, cluster around the
    // jittered point). Otherwise fall back to a random in-zone point.
    const center = mobConfig.position
      ? jitterAround(mobConfig.position, mobConfig.spawnRadius ?? DEFAULT_MOB_SPAWN_RADIUS, rand)
      : zoneManager.getRandomPositionInZone(zoneId, rand);
    if (!center) {
      break;
    }
    const packId = groupSize > 1 ? `pack-${zoneId}-${mobConfig.type}-${spawned}-${now}` : undefined;
    for (let i = 0; i < groupSize; i += 1) {
      const position = packId ? clusterAround(center, i, rand) : center;
      const enemy = createEnemy(mobConfig.type, zoneManager.getMobLevel(zoneId, rand), position, now, { packId });
      state.enemies[enemy.id] = enemy;
      state.zones.enemyZoneIds[enemy.id] = zoneId;
      spatial.insert(enemy.id, { x: enemy.position.x, z: enemy.position.z });
      spawned += 1;
    }
  }
  return spawned;
}

function jitterAround(
  anchor: { x: number; y: number; z: number },
  radius: number,
  rand: () => number,
): Enemy['position'] {
  const angle = rand() * Math.PI * 2;
  const dist = Math.sqrt(rand()) * radius;
  const x = anchor.x + Math.cos(angle) * dist;
  const z = anchor.z + Math.sin(angle) * dist;
  return { x, y: getTerrainHeight(x, z) + 0.5, z };
}

function clusterAround(
  center: Enemy['position'],
  offsetIndex: number,
  rand: () => number,
): Enemy['position'] {
  if (offsetIndex === 0) {
    return { ...center };
  }
  const angle = (offsetIndex / 6) * Math.PI * 2;
  const radius = PACK_CLUSTER_RADIUS * (0.4 + rand() * 0.6);
  const x = center.x + Math.cos(angle) * radius;
  const z = center.z + Math.sin(angle) * radius;
  return { x, y: getTerrainHeight(x, z) + 0.5, z };
}

export function respawnDeadEnemies(
  state: GameState,
  spatial: SpatialHashGrid,
  outbound: OutboundEventSink,
  now: number,
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

    if (now - enemy.deathTimeTs < respawnDelayFor(enemy)) {
      continue;
    }

    resetEnemyForRespawn(enemy);

    spatial.insert(enemyId, { x: enemy.position.x, z: enemy.position.z });
    emitEnemyUpdated(outbound, enemy);
    respawned += 1;

    // §11 named encounter tracking — broadcast the comeback so
    // players know the mini-boss is available again.
    if (enemy.isMiniBoss) {
      emitMiniBossRespawnBroadcast(outbound, enemy, now);
    }
  }

  return respawned;
}

function emitMiniBossRespawnBroadcast(
  outbound: OutboundEventSink,
  enemy: Enemy,
  now: number,
): void {
  const spec = enemy.bossId ? getMiniBossById(enemy.bossId) : null;
  const where = spec?.zoneHint ? ` stalks ${spec.zoneHint} once more!` : ' has returned!';
  emitServerMessage(outbound, {
    type: 'ChatBroadcast',
    fromId: enemy.id,
    fromName: enemy.name,
    text: `${enemy.name}${where}`,
    scope: 'all',
    ts: now,
  });
}

/**
 * Archwork item #2 — explicit full reset for a respawning enemy.
 *
 * The prior implementation only reset isAlive / health / position /
 * targetId / statusEffects. Everything else carried through to the
 * new life:
 *
 *  - `deathTimeTs` stayed at the old kill time, so the next death
 *    test (now - deathTimeTs >= delay) was technically true the
 *    moment the enemy died (a no-op for the loop, but a footgun).
 *  - `aiState` could be 'chasing' / 'attacking' / 'returning' at
 *    death, so the new life started mid-state.
 *  - velocity could be non-zero, so a respawned mob would drift.
 *  - chase / patrol bookkeeping (chaseStartedAt, aggroSuppressedUntilTs,
 *    patrolTarget, patrolWaitUntilTs) stayed stale.
 *  - mini-boss enrage / phase-shift / mid-signature state carried over,
 *    so a boss killed mid-enrage respawned still enraged with a
 *    pre-broken signature timer and elevated attackDamage / movementSpeed.
 *
 * Doing the reset explicitly here (instead of recreating the enemy
 * from createEnemy) preserves the same instance identity so the
 * spatial grid + scoped snapshots keep their references; this is
 * only a state clear, not a re-spawn of a new entity.
 */
function resetEnemyForRespawn(enemy: Enemy): void {
  enemy.isAlive = true;
  enemy.health = enemy.maxHealth;
  enemy.position = { ...enemy.spawnPosition };
  enemy.statusEffects = [];

  // Combat targeting / AI state.
  enemy.targetId = null;
  enemy.aiState = 'idle';
  enemy.velocity = { x: 0, z: 0 };
  enemy.deathTimeTs = undefined;
  enemy.lastAttackTime = 0;
  enemy.attackCooldown = undefined;

  // Chase / patrol bookkeeping.
  enemy.chaseStartedAt = undefined;
  enemy.aggroSuppressedUntilTs = undefined;
  enemy.patrolTarget = undefined;
  enemy.patrolWaitUntilTs = undefined;
  enemy.combatStartedTs = undefined;

  // Mini-boss lifecycle: enrage / phase / signature all clear, and
  // attackDamage / movementSpeed restore to the values captured at
  // spawn so the next life starts clean. baseAttackDamage /
  // baseMovementSpeed are only populated for mini-bosses; the
  // optional-chain falls through to a no-op for normal mobs.
  if (enemy.baseAttackDamage !== undefined) {
    enemy.attackDamage = enemy.baseAttackDamage;
  }
  if (enemy.baseMovementSpeed !== undefined) {
    enemy.movementSpeed = enemy.baseMovementSpeed;
  }
  enemy.enraged = undefined;
  enemy.phaseShifted = undefined;
  enemy.signatureCastingUntilTs = undefined;
  enemy.signatureCastTargetX = undefined;
  enemy.signatureCastTargetZ = undefined;
  enemy.signatureCastRadius = undefined;
  enemy.nextSignatureReadyTs = undefined;
}
