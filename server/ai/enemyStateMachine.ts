import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { SkillId } from '../../packages/content/skills.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import { hash, rng as makeRng } from '../../packages/sim/combatMath.js';
import { isEntityStunned } from '../combat/statusQueries.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  resetBossProgression,
  tickBossProgression,
  tickBossSignature,
} from './bossSignature.js';
import {
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
  // The mob wants to cast `skillId` at `targetId` — resolved by the
  // emitter through the same cast pipeline players use (castMobSkill).
  | { type: 'castSkill'; enemyId: string; targetId: string; skillId: SkillId }
  | { type: 'packAggro'; packId: string; targetId: string; sourceEnemyId: string }
  | { type: 'packDisengage'; packId: string; sourceEnemyId: string }
  | {
      // Archwork #6 follow-up — Grakk's Warband Howl. Pulls EVERY
      // alive packmate within `radius` onto `targetId` regardless of
      // their current AI state. Stronger than packAggro (which only
      // wakes idle/patrolling packmates).
      type: 'summonPack';
      packId: string;
      targetId: string;
      sourceEnemyId: string;
      radius: number;
      bossName: string;
    }
  | {
      type: 'bossTelegraph';
      enemyId: string;
      bossName: string;
      abilityName: string;
      x: number;
      z: number;
      radius: number;
      innerRadius?: number;
      directionRad?: number;
      halfAngleDeg?: number;
      windUpMs: number;
      impactAt: number;
    }
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
   * Returns a uniform value in [0, 1) for patrol-target picks +
   * patrol-wait jitter. When omitted, the state machine derives a
   * DETERMINISTIC stream seeded on (enemy.id, now) — never ambient
   * Math.random — so the same world replays identically on a SimClock.
   * Tests/the live loop may still inject a specific stream.
   */
  rng?: () => number;
};

/**
 * The patrol RNG: the injected stream if the caller provided one, else
 * a stream seeded on this enemy + this instant. Deterministic either
 * way — a given (enemy, tick) always picks the same patrol point.
 */
function patrolRng(enemy: Enemy, context: EnemyAIContext): () => number {
  return context.rng ?? makeRng(hash(`patrol:${enemy.id}:${context.now}`));
}

export type EnemyAIProgress = {
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

  if (enemy.isMiniBoss) {
    tickBossProgression(enemy, context.now, progress);
    tickBossSignature(enemy, context, progress);
  }

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
  //
  // Exception: idle→patrolling specifically does NOT cascade. The
  // patrol target generated in advanceIdleEnemy needs a full tick to
  // settle before advancePatrollingEnemy evaluates "have we arrived?"
  // — otherwise a random target inside PATROL_ARRIVAL_DISTANCE gets
  // cleared on the same tick and the enemy stands still generating-
  // and-clearing patrol targets every frame instead of wandering.
  // Aggro-driven cascades (idle→chasing, patrolling→chasing→attacking)
  // are unaffected.
  if (enemy.aiState === 'idle') {
    advanceIdleEnemy(enemy, context, progress);
  }

  const justStartedPatrolling = previousState === 'idle' && enemy.aiState === 'patrolling';
  if (enemy.aiState === 'patrolling' && !justStartedPatrolling) {
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

/**
 * PR CC — patrol radius. Bosses stay glued to their declared spawn
 * coord (so the encounter remains findable). Normal mobs roam more
 * freely; the zone defines where they're strong, not a fence.
 */
const PATROL_RADIUS_NORMAL = 60;
const PATROL_RADIUS_BOSS = 8;
function patrolRadiusFor(enemy: Enemy): number {
  return enemy.isMiniBoss ? PATROL_RADIUS_BOSS : PATROL_RADIUS_NORMAL;
}
const PATROL_WAIT_MIN_MS = 2_000;
const PATROL_WAIT_MAX_MS = 6_000;
const PATROL_ARRIVAL_DISTANCE = 0.7;
/**
 * Max distance from spawn point an enemy will chase before giving up
 * and returning. Without this leash a player could kite any enemy
 * across the entire world (and have it never reset). Bosses keep
 * the tight 60m so they're always findable at their declared coord;
 * normal mobs get a much longer leash so they actually feel alive
 * outside their spawn circle.
 */
const LEASH_NORMAL = 200;
const LEASH_BOSS = 60;
function leashDistanceFor(enemy: Enemy): number {
  return enemy.isMiniBoss ? LEASH_BOSS : LEASH_NORMAL;
}
// Kept exported for tests / callers that need a single canonical value.
export const MAX_CHASE_DISTANCE_FROM_SPAWN = LEASH_NORMAL;

/**
 * If an enemy stays in the chasing state this long without ever
 * reaching attack range, it gives up and returns. Prevents the
 * "kite forever just outside attackRange" exploit where a faster
 * player keeps an enemy in chase indefinitely without ever taking a
 * hit. 8 seconds is generous for a real footrace inside the leash
 * radius but short enough that a deliberate kite quickly resets.
 */
export const MAX_CHASE_TIME_WITHOUT_HIT_MS = 8_000;

/**
 * After anti-kite trips, the enemy refuses to re-aggro the same (or
 * any) target for this long. Just long enough to break the same-tick
 * cascade chasing→returning→re-aggro→chasing loop; the player can
 * re-engage after the cooldown by actually approaching the enemy.
 */
const ANTI_KITE_REAGGRO_COOLDOWN_MS = 2_000;

function advanceIdleEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const targetId = isAggroSuppressed(enemy, context.now) ? null : findNearbyAggroTarget(enemy, context);
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

  if (enemy.aiState === 'idle' && distanceXZ(enemy.position, enemy.spawnPosition) > patrolRadiusFor(enemy) + 1) {
    enemy.aiState = 'returning';
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  const now = context.now;
  if (enemy.patrolWaitUntilTs && enemy.patrolWaitUntilTs > now) {
    return;
  }
  if (!enemy.patrolTarget) {
    const rng = patrolRng(enemy, context);
    const angle = rng() * Math.PI * 2;
    const radius = rng() * patrolRadiusFor(enemy);
    enemy.patrolTarget = {
      x: enemy.spawnPosition.x + Math.cos(angle) * radius,
      z: enemy.spawnPosition.z + Math.sin(angle) * radius,
    };
  }
  enemy.aiState = 'patrolling';
  progress.shouldBroadcastEnemyUpdate = true;
}

function advancePatrollingEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const targetId = isAggroSuppressed(enemy, context.now) ? null : findNearbyAggroTarget(enemy, context);
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
    const rng = patrolRng(enemy, context);
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
    emitPackDisengageIfNeeded(enemy, progress);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  // Vanish/Stealth: lose the target lock if they go invisible.
  if (isPlayerInvisible(targetPlayer, context.now)) {
    enemy.targetId = null;
    enemy.aiState = 'returning';
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} lost sight of invisible target, returning.` });
    emitPackDisengageIfNeeded(enemy, progress);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  // Leash: stop chasing once we've strayed too far from spawn so a
  // player can't kite a mob across the world. The enemy gives up on
  // its current target and heads home.
  if (distanceXZ(enemy.position, enemy.spawnPosition) > leashDistanceFor(enemy)) {
    enemy.targetId = null;
    enemy.chaseStartedAt = undefined;
    enemy.aiState = 'returning';
    stopEnemy(enemy);
    progress.events.push({
      type: 'log',
      message: `[AI] Enemy ${enemy.id} exceeded leash distance from spawn, returning.`,
    });
    emitPackDisengageIfNeeded(enemy, progress);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  // Anti-kite: if we've been chasing this target too long without ever
  // reaching attack range, give up.
  //
  // `??=` persists the first-seen timestamp so re-entries (attacking →
  // chasing on target moved out of range, returning → chasing on
  // re-aggro inside leash) actually start an 8-second window — a bare
  // `??` fallback without assignment would compare context.now to
  // itself every tick and the timeout would never fire.
  const chaseStartedAt = (enemy.chaseStartedAt ??= context.now);
  if (context.now - chaseStartedAt > MAX_CHASE_TIME_WITHOUT_HIT_MS) {
    enemy.targetId = null;
    enemy.chaseStartedAt = undefined;
    enemy.aiState = 'returning';
    enemy.aggroSuppressedUntilTs = context.now + ANTI_KITE_REAGGRO_COOLDOWN_MS;
    stopEnemy(enemy);
    progress.events.push({
      type: 'log',
      message: `[AI] Enemy ${enemy.id} gave up chase (kited for ${Math.round((context.now - chaseStartedAt) / 1000)}s), returning.`,
    });
    emitPackDisengageIfNeeded(enemy, progress);
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
    emitPackDisengageIfNeeded(enemy, progress);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  if (isPlayerInvisible(targetPlayer, context.now)) {
    enemy.targetId = null;
    enemy.aiState = 'returning';
    progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} lost sight of invisible target mid-attack, returning.` });
    emitPackDisengageIfNeeded(enemy, progress);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  if (distanceXZ(enemy.position, targetPlayer.position) > enemy.attackRange) {
    enemy.aiState = 'chasing';
    enemy.chaseStartedAt = context.now;
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
    if (enemy.isMiniBoss) {
      resetBossProgression(enemy);
    }
    progress.shouldBroadcastEnemyUpdate = true;
  } else {
    moveEnemyToward(enemy, enemy.spawnPosition, context.spatialGrid, context.deltaTime, context.now);
  }

  // Don't re-aggro while still beyond the leash boundary, otherwise a
  // hovering player would flip the enemy back to chasing immediately
  // and the leash never holds.
  if (distanceFromSpawn > leashDistanceFor(enemy)) {
    return;
  }

  if (isAggroSuppressed(enemy, context.now)) {
    return;
  }

  const targetId = findNearbyAggroTarget(enemy, context);
  if (targetId) {
    enemy.targetId = targetId;
    enemy.aiState = 'chasing';
    enemy.chaseStartedAt = context.now;
    progress.shouldBroadcastEnemyUpdate = true;
  }
}

function isAggroSuppressed(enemy: Enemy, now: number): boolean {
  return enemy.aggroSuppressedUntilTs !== undefined && now < enemy.aggroSuppressedUntilTs;
}

function applyAttackIfReady(
  enemy: Enemy,
  targetPlayer: PlayerState,
  now: number,
  progress: EnemyAIProgress,
): void {
  // Global attack cadence (attackCooldownMs). The actual hit/miss +
  // damage + effects resolve later this tick in the combat phase: the
  // emitter turns this intent into a real cast (castMobSkill) and
  // tickCasts resolves it through the same pipeline players use. The
  // enemy drops a target it has killed organically next tick (the dead
  // player is no longer a valid aggro target).
  if (now - enemy.lastAttackTime < enemy.attackCooldownMs) return;
  const skillId = selectMobSkill(enemy, now);
  if (!skillId) return;
  enemy.lastAttackTime = now;
  progress.events.push({ type: 'castSkill', enemyId: enemy.id, targetId: targetPlayer.id, skillId });
}

/**
 * The first skill in the mob's priority list that's off its per-skill
 * cooldown. Signature skills are listed first; `mobStrike` (cooldown 0)
 * is the always-ready fallback at the end.
 */
function selectMobSkill(enemy: Enemy, now: number): SkillId | null {
  for (const id of enemy.skills ?? []) {
    if ((enemy.skillCooldownEndTs?.[id] ?? 0) <= now) return id;
  }
  return null;
}

// §46/slice-3 — emit a packDisengage event when this enemy quits a
// chase; enemyAI pulls packmates within `packAggroRadius` back to
// returning too so the pack engages and breaks as a unit.
function emitPackDisengageIfNeeded(enemy: Enemy, progress: EnemyAIProgress): void {
  if (enemy.packId) {
    progress.events.push({ type: 'packDisengage', packId: enemy.packId, sourceEnemyId: enemy.id });
  }
}

// Enemy stun gate (also recognises freeze/root — Section 8 L515).
function isEnemyStunned(enemy: Enemy, now: number): boolean {
  return isEntityStunned(enemy, now);
}

function findNearbyAggroTarget(enemy: Enemy, context: EnemyAIContext): string | null {
  const nearbyPlayerIds = context.spatialGrid.queryCircle(
    { x: enemy.position.x, z: enemy.position.z },
    enemy.aggroRadius,
  );
  return findAggroTargetId(enemy, context.players, nearbyPlayerIds, context.now);
}

/**
 * PR N — mini-boss progression. Once the boss is in combat:
 *  - After `enrageAfterMs`, damage gets a one-time multiplier.
 *  - Once HP crosses below `phaseTwoHpFraction`, speed + damage get a
 *    second one-time multiplier.
 * Both flags persist until the boss returns to spawn (then reset by
 * resetBossProgression in ./bossSignature.ts) or respawns
 * (createEnemy starts from base).
 */

// Mini-boss signature ticks + impact resolution live in
// ./bossSignature.ts (extracted in archwork #6 follow-up so the
// state-machine file stays under the 700-line maintainability cap
// once the typed mechanic kinds landed).

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
