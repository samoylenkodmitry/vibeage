// server/ai/enemyAI.ts
import { Enemy } from '../../packages/sim/entities.js';
import { DEFAULT_PACK_AGGRO_RADIUS_M } from '../../packages/content/enemies.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { EntityState } from '../gameState.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import {
  emitEnemyUpdated,
  emitPlayerUpdated,
  emitServerMessage,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';
import { advanceEnemyState, type EnemyAIEvent } from './enemyStateMachine.js';
import { castMobSkill, type ActiveCastStore } from '../combat/skillSystem.js';
import type { CombatWorld } from '../combat/worldContract.js';

// §46/slice-3 — pack aggro / disengage now read the source enemy's
// `packAggroRadius` (set per species via EnemyStatMultipliers).
// `DEFAULT_PACK_AGGRO_RADIUS_M` is the baseline (60m) when the mob
// template doesn't carry an override.

/**
 * Everything the AI phase needs to advance a mob + resolve its events
 * (including casting through the shared pipeline). Bundled so the AI
 * functions stay within the maintainability param budget.
 */
export type EnemyAiTickContext = {
  state: EntityState;
  outbound: OutboundEventSink;
  spatial: SpatialHashGrid;
  now: number;
  world: CombatWorld;
  activeCasts: ActiveCastStore;
};

export function updateEnemyAI(enemy: Enemy, deltaTime: number, ctx: EnemyAiTickContext): void {
  const result = advanceEnemyState(enemy, {
    players: ctx.state.players,
    spatialGrid: ctx.spatial,
    deltaTime,
    now: ctx.now,
  });

  for (const event of result.events) {
    emitEnemyAIEvent(event, enemy, ctx);
  }

  if (result.enemyUpdate) {
    emitEnemyUpdated(ctx.outbound, result.enemyUpdate);
  }
}

function emitEnemyAIEvent(event: EnemyAIEvent, source: Enemy, ctx: EnemyAiTickContext): void {
  const { state: gameState, outbound, spatial: spatialGrid, now, world, activeCasts } = ctx;
  if (event.type === 'log') {
    debug(LOG_CATEGORIES.ENEMY, event.message);
    return;
  }

  if (event.type === 'castSkill') {
    // Turn the AI's intent into a real cast through the shared pipeline;
    // tickCasts (combat phase) resolves it. Only cast at a live target.
    const target = gameState.players[event.targetId];
    if (target?.isAlive) {
      castMobSkill(source, target, event.skillId, now, { world, activeCasts, outbound });
    }
    return;
  }

  if (event.type === 'enemyAttack') {
    debug(LOG_CATEGORIES.ENEMY, `Enemy ${event.enemyId} attacked player ${event.targetId}`, {
      damage: event.damage,
      targetHealth: event.targetHealth,
    });
    emitServerMessage(outbound, {
      type: 'EnemyAttack',
      enemyId: event.enemyId,
      targetId: event.targetId,
      damage: event.damage,
    });
    emitPlayerUpdated(outbound, {
      id: event.targetId,
      health: event.targetHealth,
    });
    return;
  }

  if (event.type === 'packAggro') {
    propagatePackAggro({
      gameState,
      spatialGrid,
      outbound,
      packId: event.packId,
      targetId: event.targetId,
      sourceEnemyId: event.sourceEnemyId,
      source,
    });
    return;
  }

  if (event.type === 'packDisengage') {
    propagatePackDisengage({
      gameState,
      spatialGrid,
      outbound,
      packId: event.packId,
      sourceEnemyId: event.sourceEnemyId,
      source,
    });
    return;
  }

  if (event.type === 'bossTelegraph') {
    emitBossTelegraph(outbound, event);
    return;
  }

  if (event.type === 'summonPack') {
    propagateSummonPack({
      gameState,
      spatialGrid,
      outbound,
      packId: event.packId,
      targetId: event.targetId,
      sourceEnemyId: event.sourceEnemyId,
      radius: event.radius,
      bossName: event.bossName,
      source,
      now,
    });
    return;
  }

  debug(LOG_CATEGORIES.ENEMY, event.message);
  emitPlayerUpdated(outbound, event.update);
}

function emitBossTelegraph(
  outbound: OutboundEventSink,
  event: Extract<EnemyAIEvent, { type: 'bossTelegraph' }>,
): void {
  emitServerMessage(outbound, {
    type: 'BossTelegraph',
    enemyId: event.enemyId,
    bossName: event.bossName,
    abilityName: event.abilityName,
    x: event.x,
    z: event.z,
    radius: event.radius,
    innerRadius: event.innerRadius,
    directionRad: event.directionRad,
    halfAngleDeg: event.halfAngleDeg,
    windUpMs: event.windUpMs,
    impactAt: event.impactAt,
  });
}

type SummonPackArgs = {
  gameState: EntityState;
  spatialGrid: SpatialHashGrid;
  outbound: OutboundEventSink;
  packId: string;
  targetId: string;
  sourceEnemyId: string;
  radius: number;
  bossName: string;
  source: Enemy;
  now: number;
};

/**
 * Archwork #6 follow-up — Grakk's Warband Howl. Stronger than the
 * `packAggro` rally: every alive packmate within `radius` is yanked
 * onto `targetId` regardless of their current state (idle, patrol,
 * mid-chase against a different player, mid-attack against a
 * different player — all get re-targeted to the boss's target).
 *
 * Also broadcasts a server-wide chat line so the player has a clear
 * "the warband heard him" signal alongside the visual telegraph.
 */
function propagateSummonPack({
  gameState, spatialGrid, outbound, packId, targetId, sourceEnemyId, radius, bossName, source, now,
}: SummonPackArgs): void {
  const candidateIds = spatialGrid.queryCircle(
    { x: source.position.x, z: source.position.z },
    radius,
  );
  let summoned = 0;
  for (const id of candidateIds) {
    const enemy = gameState.enemies[id];
    if (!enemy || enemy.packId !== packId || enemy.id === sourceEnemyId || !enemy.isAlive) {
      continue;
    }
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    enemy.chaseStartedAt = now;
    enemy.patrolTarget = undefined;
    emitEnemyUpdated(outbound, { id: enemy.id, targetId: enemy.targetId, aiState: enemy.aiState });
    summoned += 1;
  }
  if (summoned > 0) {
    emitServerMessage(outbound, {
      type: 'ChatBroadcast',
      fromId: source.id,
      fromName: bossName,
      text: `${bossName} howls — ${summoned} warband${summoned === 1 ? '' : 'mate'} answer${summoned === 1 ? 's' : ''}!`,
      scope: 'all',
      ts: now,
    });
  }
}

type PackAggroArgs = {
  gameState: EntityState;
  spatialGrid: SpatialHashGrid;
  outbound: OutboundEventSink;
  packId: string;
  targetId: string;
  sourceEnemyId: string;
  source: Enemy;
};

function propagatePackAggro({ gameState, spatialGrid, outbound, packId, targetId, sourceEnemyId, source }: PackAggroArgs): void {
  const radius = source.packAggroRadius ?? DEFAULT_PACK_AGGRO_RADIUS_M;
  const candidateIds = spatialGrid.queryCircle(
    { x: source.position.x, z: source.position.z },
    radius,
  );
  for (const id of candidateIds) {
    const enemy = gameState.enemies[id];
    if (!enemy || enemy.packId !== packId || enemy.id === sourceEnemyId || !enemy.isAlive) {
      continue;
    }
    if (enemy.aiState !== 'idle' && enemy.aiState !== 'patrolling') {
      continue;
    }
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    enemy.patrolTarget = undefined;
    emitEnemyUpdated(outbound, { id: enemy.id, targetId: enemy.targetId, aiState: enemy.aiState });
  }
}

type PackDisengageArgs = {
  gameState: EntityState;
  spatialGrid: SpatialHashGrid;
  outbound: OutboundEventSink;
  packId: string;
  sourceEnemyId: string;
  source: Enemy;
};

// §46/slice-3 — when one mob in a pack disengages (leash trip, anti-
// kite, target died), packmates currently chasing/attacking the same
// target release too and head home. Pack stays cohesive: it engages
// as a unit and breaks off as a unit, rather than one mob hanging
// around solo because it happened to keep aggro.
function propagatePackDisengage({ gameState, spatialGrid, outbound, packId, sourceEnemyId, source }: PackDisengageArgs): void {
  const radius = source.packAggroRadius ?? DEFAULT_PACK_AGGRO_RADIUS_M;
  const candidateIds = spatialGrid.queryCircle(
    { x: source.position.x, z: source.position.z },
    radius,
  );
  for (const id of candidateIds) {
    const enemy = gameState.enemies[id];
    if (!enemy || enemy.packId !== packId || enemy.id === sourceEnemyId || !enemy.isAlive) {
      continue;
    }
    if (enemy.aiState !== 'chasing' && enemy.aiState !== 'attacking') {
      continue;
    }
    enemy.targetId = null;
    enemy.aiState = 'returning';
    enemy.chaseStartedAt = undefined;
    emitEnemyUpdated(outbound, { id: enemy.id, targetId: enemy.targetId, aiState: enemy.aiState });
  }
}
