import {
  getMiniBossById,
  mechanicInnerRadius,
  mechanicOuterRadius,
  type MiniBossMechanic,
} from '../../packages/content/miniBosses.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import { isEntityStunned } from '../combat/statusQueries.js';
import { killPlayer } from '../players/playerLifecycle.js';
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
  | { type: 'packDisengage'; packId: string; sourceEnemyId: string }
  | {
      type: 'bossTelegraph';
      enemyId: string;
      bossName: string;
      abilityName: string;
      x: number;
      z: number;
      radius: number;
      innerRadius?: number;
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
    const rng = context.rng ?? Math.random;
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
    emitPackDisengageIfNeeded(enemy, progress);
    progress.shouldBroadcastEnemyUpdate = true;
  }
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
 * resetBossProgression) or respawns (createEnemy starts from base).
 */
function tickBossProgression(enemy: Enemy, now: number, progress: EnemyAIProgress): void {
  const cfg = enemy.bossConfig;
  if (!cfg) return;
  const inCombat = enemy.aiState === 'chasing' || enemy.aiState === 'attacking';
  if (inCombat && enemy.combatStartedTs === undefined) {
    enemy.combatStartedTs = now;
  }
  if (!enemy.enraged && enemy.combatStartedTs !== undefined && now - enemy.combatStartedTs >= cfg.enrageAfterMs) {
    enemy.enraged = true;
    enemy.attackDamage = (enemy.baseAttackDamage ?? enemy.attackDamage) * effectiveDamageMul(enemy);
    progress.events.push({ type: 'log', message: `[BOSS] ${enemy.name} enrages — damage now ${enemy.attackDamage.toFixed(1)}` });
    progress.shouldBroadcastEnemyUpdate = true;
  }
  if (!enemy.phaseShifted && enemy.health < enemy.maxHealth * cfg.phaseTwoHpFraction) {
    enemy.phaseShifted = true;
    enemy.attackDamage = (enemy.baseAttackDamage ?? enemy.attackDamage) * effectiveDamageMul(enemy);
    enemy.movementSpeed = (enemy.baseMovementSpeed ?? enemy.movementSpeed) * cfg.phaseTwoSpeedMul;
    progress.events.push({ type: 'log', message: `[BOSS] ${enemy.name} phase 2 — speed ${enemy.movementSpeed.toFixed(1)}, damage ${enemy.attackDamage.toFixed(1)}` });
    progress.shouldBroadcastEnemyUpdate = true;
  }
}

function effectiveDamageMul(enemy: Enemy): number {
  const cfg = enemy.bossConfig;
  if (!cfg) return 1;
  let mul = 1;
  if (enemy.enraged) mul *= cfg.enragedDamageMul;
  if (enemy.phaseShifted) mul *= cfg.phaseTwoDamageMul;
  return mul;
}

function resetBossProgression(enemy: Enemy): void {
  enemy.combatStartedTs = undefined;
  enemy.enraged = false;
  enemy.phaseShifted = false;
  enemy.signatureCastingUntilTs = undefined;
  enemy.signatureCastTargetX = undefined;
  enemy.signatureCastTargetZ = undefined;
  enemy.signatureCastRadius = undefined;
  enemy.nextSignatureReadyTs = undefined;
  if (enemy.baseAttackDamage !== undefined) enemy.attackDamage = enemy.baseAttackDamage;
  if (enemy.baseMovementSpeed !== undefined) enemy.movementSpeed = enemy.baseMovementSpeed;
}

/**
 * PR Q — mini-boss telegraphed signature. One cast per cooldown
 * window when in attacking/chasing state. Wind-up begins on entry;
 * impact resolves to an AOE around the cast target snapshot
 * (target position at cast start). The visual telegraph is
 * emitted on cast start so the client can render a growing ring;
 * damage applies via the standard enemyAttack channel so existing
 * combat-log / damage-number paths reuse.
 */
function tickBossSignature(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  if (!enemy.bossId) return;
  const spec = getMiniBossById(enemy.bossId);
  const mech = spec?.signatureAbility.mechanic;
  if (!spec || !mech) return;
  const outer = mechanicOuterRadius(mech);
  const inner = mechanicInnerRadius(mech);

  // Active cast → check for impact.
  if (enemy.signatureCastingUntilTs !== undefined) {
    if (context.now >= enemy.signatureCastingUntilTs) {
      resolveBossSignatureImpact(enemy, mech, spec.name, context, progress);
      enemy.signatureCastingUntilTs = undefined;
      enemy.signatureCastTargetX = undefined;
      enemy.signatureCastTargetZ = undefined;
      enemy.signatureCastRadius = undefined;
      enemy.nextSignatureReadyTs = context.now + mech.cooldownMs;
    }
    return;
  }

  // Idle / patrolling / returning: signature only fires in active combat.
  if (enemy.aiState !== 'attacking' && enemy.aiState !== 'chasing') return;

  // First sight of combat seeds the cooldown so the boss doesn't open
  // with the signature the very first tick.
  if (enemy.nextSignatureReadyTs === undefined) {
    enemy.nextSignatureReadyTs = context.now + Math.min(mech.cooldownMs, 4_000);
    return;
  }
  if (context.now < enemy.nextSignatureReadyTs) return;

  // Aim at the current target's position; if no target, skip.
  const target = enemy.targetId ? context.players[enemy.targetId] : null;
  if (!target?.isAlive) return;

  enemy.signatureCastingUntilTs = context.now + mech.windUpMs;
  enemy.signatureCastTargetX = target.position.x;
  enemy.signatureCastTargetZ = target.position.z;
  enemy.signatureCastRadius = outer;
  progress.events.push({
    type: 'bossTelegraph',
    enemyId: enemy.id,
    bossName: spec.name,
    abilityName: spec.signatureAbility.name,
    x: target.position.x,
    z: target.position.z,
    radius: outer,
    ...(inner > 0 ? { innerRadius: inner } : {}),
    windUpMs: mech.windUpMs,
    impactAt: context.now + mech.windUpMs,
  });
}

function resolveBossSignatureImpact(
  enemy: Enemy,
  mech: MiniBossMechanic,
  bossName: string,
  context: EnemyAIContext,
  progress: EnemyAIProgress,
): void {
  const cx = enemy.signatureCastTargetX ?? enemy.position.x;
  const cz = enemy.signatureCastTargetZ ?? enemy.position.z;
  const outer = mechanicOuterRadius(mech);
  const inner = mechanicInnerRadius(mech);
  const damage = enemy.attackDamage * mech.damageMul;
  for (const p of Object.values(context.players)) {
    if (!p.isAlive) continue;
    const dx = p.position.x - cx;
    const dz = p.position.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq > outer * outer) continue;
    // Archwork #6 — donut mechanic: spare players inside the safe
    // spot at the centre. Circle mechanics have inner = 0 so this
    // is a no-op for them.
    if (inner > 0 && distSq < inner * inner) continue;
    p.health -= damage;
    // Archwork item #2 sub-work 1 — boss-signature damage funnels
    // through the same player-death helper as normal enemy hits so
    // the death-state shape stays in sync.
    const killed = p.health <= 0 ? killPlayer(p, context.now) : false;
    progress.events.push({
      type: 'enemyAttack',
      enemyId: enemy.id,
      targetId: p.id,
      damage,
      targetHealth: p.health,
    });
    if (killed) {
      progress.events.push({
        type: 'playerKilled',
        message: `[BOSS] ${bossName}'s signature killed ${p.id}`,
        update: {
          id: p.id,
          health: p.health,
          isAlive: p.isAlive,
          deathTimeTs: p.deathTimeTs,
          targetId: p.targetId,
          castingSkill: p.castingSkill,
          castingProgressMs: p.castingProgressMs,
        },
      });
    }
  }
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
