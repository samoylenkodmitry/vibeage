import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  applyEnemyAttack,
  faceEnemyToward,
  findAggroTargetId,
  isPlayerInvisible,
  makeEnemyUpdate,
  markEnemyDirty,
  moveEnemyToward,
  snapEnemyToSpawn,
  stopEnemy,
} from './enemyBehavior.js';

type EnemyUpdate = Pick<Enemy, 'id' | 'targetId' | 'aiState'>;

export type EnemyAIEvent =
  | { type: 'log'; message: string }
  | { type: 'enemyAttack'; enemyId: string; targetId: string; damage: number; targetHealth: number }
  | { type: 'packAggro'; packId: string; targetId: string; sourceEnemyId: string }
  | {
      type: 'playerKilled';
      message: string;
      update: Pick<PlayerState, 'id' | 'health' | 'isAlive' | 'deathTimeTs' | 'targetId' | 'castingSkill' | 'castingProgressMs'>;
    };

export type EnemyAIResult = {
  events: EnemyAIEvent[];
  enemyUpdate?: EnemyUpdate;
};

export type EnemyAIContext = {
  players: Record<string, PlayerState>;
  spatialGrid: SpatialHashGrid;
  deltaTime: number;
  now: number;
  /**
   * Returns a uniform value in [0, 1). Defaults to Math.random in
   * production; tests pass a seeded fn so patrol target picks +
   * patrol-wait jitter become reproducible.
   */
  rng?: () => number;
};

type EnemyAIProgress = {
  events: EnemyAIEvent[];
  shouldBroadcastEnemyUpdate: boolean;
};

export function advanceEnemyState(enemy: Enemy, context: EnemyAIContext): EnemyAIResult {
  if (!enemy.isAlive) {
    return { events: [] };
  }

  const previousVelocity = { ...(enemy.velocity || { x: 0, z: 0 }) };
  const previousState = enemy.aiState;
  const progress: EnemyAIProgress = { events: [], shouldBroadcastEnemyUpdate: false };

  // Stun: skip all state actions while a stun effect is active. The
  // enemy keeps its current aiState (so chase resumes immediately
  // after the stun expires) but does not move, attack, or re-aggro.
  if (isEnemyStunned(enemy, context.now)) {
    stopEnemy(enemy);
    enemy.lastUpdateTime = context.now;
    markDirtyIfMotionChanged(enemy, previousState, previousVelocity);
    return { events: progress.events };
  }

  // The if-cascade intentionally lets a single tick walk through
  // related transitions (e.g., idle→chasing→attacking on aggro at
  // melee range). The leash bounce is prevented inside
  // advanceReturningEnemy by refusing to re-aggro while still beyond
  // MAX_CHASE_DISTANCE_FROM_SPAWN, not by structurally forbidding the
  // cascade.
  if (enemy.aiState === 'idle') {
    advanceIdleEnemy(enemy, context, progress);
  }

  if (enemy.aiState === 'patrolling') {
    advancePatrollingEnemy(enemy, context, progress);
  }

  if (enemy.aiState === 'chasing') {
    advanceChasingEnemy(enemy, context, progress);
  }

  if (enemy.aiState === 'attacking') {
    advanceAttackingEnemy(enemy, context, progress);
  }

  if (enemy.aiState === 'returning') {
    advanceReturningEnemy(enemy, context, progress);
  }

  enemy.lastUpdateTime = context.now;
  markDirtyIfMotionChanged(enemy, previousState, previousVelocity);

  return {
    events: progress.events,
    enemyUpdate: progress.shouldBroadcastEnemyUpdate ? makeEnemyUpdate(enemy) : undefined,
  };
}

const PATROL_RADIUS = 8;
const PATROL_WAIT_MIN_MS = 2_000;
const PATROL_WAIT_MAX_MS = 6_000;
const PATROL_ARRIVAL_DISTANCE = 0.7;
/**
 * Max distance from spawn point an enemy will chase before giving up
 * and returning. Without this leash a player could kite any enemy
 * across the entire world (and have it never reset).
 */
export const MAX_CHASE_DISTANCE_FROM_SPAWN = 60;

/**
 * If an enemy stays in the chasing state this long without ever
 * reaching attack range, it gives up and returns. Prevents the
 * "kite forever just outside attackRange" exploit where a faster
 * player keeps an enemy in chase indefinitely without ever taking a
 * hit. 8 seconds is generous for a real footrace inside the leash
 * radius but short enough that a deliberate kite quickly resets.
 */
export const MAX_CHASE_TIME_WITHOUT_HIT_MS = 8_000;

function advanceIdleEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const targetId = findNearbyAggroTarget(enemy, context);
  if (targetId) {
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    enemy.chaseStartedAt = context.now;
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} aggroed player ${targetId}` });
    if (enemy.packId) {
      progress.events.push({ type: 'packAggro', packId: enemy.packId, targetId, sourceEnemyId: enemy.id });
    }
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  if (enemy.aiState === 'idle' && distanceXZ(enemy.position, enemy.spawnPosition) > PATROL_RADIUS + 1) {
    enemy.aiState = 'returning';
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  const now = context.now;
  if (enemy.patrolWaitUntilTs && enemy.patrolWaitUntilTs > now) {
    return;
  }
  if (!enemy.patrolTarget) {
    const rng = context.rng ?? Math.random;
    const angle = rng() * Math.PI * 2;
    const radius = rng() * PATROL_RADIUS;
    enemy.patrolTarget = {
      x: enemy.spawnPosition.x + Math.cos(angle) * radius,
      z: enemy.spawnPosition.z + Math.sin(angle) * radius,
    };
  }
  enemy.aiState = 'patrolling';
  progress.shouldBroadcastEnemyUpdate = true;
}

function advancePatrollingEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const targetId = findNearbyAggroTarget(enemy, context);
  if (targetId) {
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    enemy.chaseStartedAt = context.now;
    enemy.patrolTarget = undefined;
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} aggroed player ${targetId} during patrol` });
    if (enemy.packId) {
      progress.events.push({ type: 'packAggro', packId: enemy.packId, targetId, sourceEnemyId: enemy.id });
    }
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }
  if (!enemy.patrolTarget) {
    enemy.aiState = 'idle';
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }
  const dist = distanceXZ(enemy.position, enemy.patrolTarget);
  if (dist <= PATROL_ARRIVAL_DISTANCE) {
    stopEnemy(enemy);
    enemy.patrolTarget = undefined;
    const rng = context.rng ?? Math.random;
    enemy.patrolWaitUntilTs = context.now + PATROL_WAIT_MIN_MS + rng() * (PATROL_WAIT_MAX_MS - PATROL_WAIT_MIN_MS);
    enemy.aiState = 'idle';
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }
  moveEnemyToward(enemy, enemy.patrolTarget, context.spatialGrid, context.deltaTime, context.now);
}

function advanceChasingEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const targetPlayer = enemy.targetId ? context.players[enemy.targetId] : null;
  if (!targetPlayer?.isAlive) {
    enemy.targetId = null;
    enemy.aiState = 'returning';
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} lost target or target died, returning.` });
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  // Vanish/Stealth: lose the target lock if they go invisible.
  if (isPlayerInvisible(targetPlayer, context.now)) {
    enemy.targetId = null;
    enemy.aiState = 'returning';
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} lost sight of invisible target, returning.` });
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  // Leash: stop chasing once we've strayed too far from spawn so a
  // player can't kite a mob across the world. The enemy gives up on
  // its current target and heads home.
  if (distanceXZ(enemy.position, enemy.spawnPosition) > MAX_CHASE_DISTANCE_FROM_SPAWN) {
    enemy.targetId = null;
    enemy.chaseStartedAt = undefined;
    enemy.aiState = 'returning';
    stopEnemy(enemy);
    progress.events.push({
      type: 'log',
      message: `[AI] Enemy ${enemy.id} exceeded leash distance from spawn, returning.`,
    });
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  // Anti-kite: if we've been chasing this target too long without ever
  // reaching attack range, give up. Prevents the "kite forever just
  // outside attackRange" exploit where a faster player keeps an enemy
  // chasing indefinitely without taking a hit.
  const chaseStartedAt = enemy.chaseStartedAt ?? context.now;
  if (context.now - chaseStartedAt > MAX_CHASE_TIME_WITHOUT_HIT_MS) {
    enemy.targetId = null;
    enemy.chaseStartedAt = undefined;
    enemy.aiState = 'returning';
    stopEnemy(enemy);
    progress.events.push({
      type: 'log',
      message: `[AI] Enemy ${enemy.id} gave up chase (kited for ${Math.round((context.now - chaseStartedAt) / 1000)}s), returning.`,
    });
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  if (distanceXZ(enemy.position, targetPlayer.position) <= enemy.attackRange) {
    enemy.aiState = 'attacking';
    enemy.chaseStartedAt = undefined;
    stopEnemy(enemy);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  moveEnemyToward(enemy, targetPlayer.position, context.spatialGrid, context.deltaTime, context.now);
}

function advanceAttackingEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const targetPlayer = enemy.targetId ? context.players[enemy.targetId] : null;
  if (!targetPlayer?.isAlive) {
    enemy.targetId = null;
    enemy.aiState = 'returning';
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} target died while attacking, returning.` });
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  if (isPlayerInvisible(targetPlayer, context.now)) {
    enemy.targetId = null;
    enemy.aiState = 'returning';
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} lost sight of invisible target mid-attack, returning.` });
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  if (distanceXZ(enemy.position, targetPlayer.position) > enemy.attackRange) {
    enemy.aiState = 'chasing';
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  faceEnemyToward(enemy, targetPlayer.position);
  applyAttackIfReady(enemy, targetPlayer, context.now, progress);
}

function advanceReturningEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const distanceFromSpawn = distanceXZ(enemy.position, enemy.spawnPosition);
  if (distanceFromSpawn <= 1.0) {
    enemy.aiState = 'idle';
    snapEnemyToSpawn(enemy, context.spatialGrid);
    progress.shouldBroadcastEnemyUpdate = true;
  } else {
    moveEnemyToward(enemy, enemy.spawnPosition, context.spatialGrid, context.deltaTime, context.now);
  }

  // Don't re-aggro while still beyond the leash boundary, otherwise a
  // hovering player would flip the enemy back to chasing immediately
  // and the leash never holds.
  if (distanceFromSpawn > MAX_CHASE_DISTANCE_FROM_SPAWN) {
    return;
  }

  const targetId = findNearbyAggroTarget(enemy, context);
  if (targetId) {
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    progress.shouldBroadcastEnemyUpdate = true;
  }
}

function applyAttackIfReady(
  enemy: Enemy,
  targetPlayer: PlayerState,
  now: number,
  progress: EnemyAIProgress,
): void {
  const attack = applyEnemyAttack(enemy, targetPlayer, now);
  if (!attack) {
    return;
  }

  progress.events.push({
    type: 'enemyAttack',
    enemyId: enemy.id,
    targetId: targetPlayer.id,
    damage: attack.damage,
    targetHealth: targetPlayer.health,
  });

  if (attack.killed) {
    progress.events.push({
      type: 'playerKilled',
      message: `[AI] Player ${targetPlayer.id} was killed by enemy ${enemy.id}`,
      update: {
        id: targetPlayer.id,
        health: targetPlayer.health,
        isAlive: targetPlayer.isAlive,
        deathTimeTs: targetPlayer.deathTimeTs,
        targetId: targetPlayer.targetId,
        castingSkill: targetPlayer.castingSkill,
        castingProgressMs: targetPlayer.castingProgressMs,
      },
    });
    enemy.targetId = null;
    enemy.aiState = 'returning';
    progress.shouldBroadcastEnemyUpdate = true;
  }
}

function isEnemyStunned(enemy: Enemy, now: number): boolean {
  return enemy.statusEffects.some((effect) => {
    if (effect.type !== 'stun') return false;
    const expiresAt = (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0);
    return expiresAt > now;
  });
}

function findNearbyAggroTarget(enemy: Enemy, context: EnemyAIContext): string | null {
  const nearbyPlayerIds = context.spatialGrid.queryCircle(
    { x: enemy.position.x, z: enemy.position.z },
    enemy.aggroRadius,
  );
  return findAggroTargetId(enemy, context.players, nearbyPlayerIds, context.now);
}

function markDirtyIfMotionChanged(
  enemy: Enemy,
  previousState: Enemy['aiState'],
  previousVelocity: { x: number; z: number },
): void {
  const newVelocity = enemy.velocity || { x: 0, z: 0 };
  if (
    previousState !== enemy.aiState
    || Math.abs(previousVelocity.x - newVelocity.x) > 0.01
    || Math.abs(previousVelocity.z - newVelocity.z) > 0.01
  ) {
    markEnemyDirty(enemy);
  }
}
