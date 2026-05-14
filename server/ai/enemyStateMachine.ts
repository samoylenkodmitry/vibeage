import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  applyEnemyAttack,
  faceEnemyToward,
  findAggroTargetId,
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

  if (enemy.aiState === 'idle') {
    advanceIdleEnemy(enemy, context, progress);
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

function advanceIdleEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const targetId = findNearbyAggroTarget(enemy, context);
  if (targetId) {
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} aggroed player ${targetId}` });
    progress.shouldBroadcastEnemyUpdate = true;
  }

  if (enemy.aiState === 'idle' && distanceXZ(enemy.position, enemy.spawnPosition) > 1) {
    enemy.aiState = 'returning';
    progress.shouldBroadcastEnemyUpdate = true;
  }
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

  if (distanceXZ(enemy.position, targetPlayer.position) <= enemy.attackRange) {
    enemy.aiState = 'attacking';
    stopEnemy(enemy);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  moveEnemyToward(enemy, targetPlayer.position, context.spatialGrid, context.deltaTime);
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

  if (distanceXZ(enemy.position, targetPlayer.position) > enemy.attackRange) {
    enemy.aiState = 'chasing';
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  faceEnemyToward(enemy, targetPlayer.position);
  applyAttackIfReady(enemy, targetPlayer, context.now, progress);
}

function advanceReturningEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  if (distanceXZ(enemy.position, enemy.spawnPosition) <= 1.0) {
    enemy.aiState = 'idle';
    snapEnemyToSpawn(enemy, context.spatialGrid);
    progress.shouldBroadcastEnemyUpdate = true;
  } else {
    moveEnemyToward(enemy, enemy.spawnPosition, context.spatialGrid, context.deltaTime);
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

function findNearbyAggroTarget(enemy: Enemy, context: EnemyAIContext): string | null {
  const nearbyPlayerIds = context.spatialGrid.queryCircle(
    { x: enemy.position.x, z: enemy.position.z },
    enemy.aggroRadius,
  );
  return findAggroTargetId(enemy, context.players, nearbyPlayerIds);
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
