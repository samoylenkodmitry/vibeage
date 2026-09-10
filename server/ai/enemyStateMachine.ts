import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { SkillId } from '../../packages/content/skills.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import { hash, rng as makeRng } from '../../packages/sim/combatMath.js';
import { isEntityStunned } from '../combat/statusQueries.js';
import { ENEMY_AI_TUNING } from '../../packages/content/enemiesAi.js';
import {
  approachSpeedMul,
  backpedalPoint,
  hasReadyRangedOption,
  hasWoundedAlly,
  holdRangeFor,
  policyFor,
  scanPack,
  selectMobSkillAtRange,
  shouldHoldForPack,
  shouldRegroup,
  strafePoint,
  strafeSign,
  withinLeash,
} from './enemyPolicy.js';
import type { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import {
  faceEnemyToward,
  findAggroTargetId,
  isPlayerInvisible,
  makeEnemyUpdate,
  markEnemyPositionDirty,
  moveEnemyToward,
  moveEnemyTowardAt,
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
  /**
   * Live mob table, so a pack hunter can see whether its packmates are
   * already on the target before it commits. Optional: callers that
   * only drive a lone mob (unit tests) simply get no rally behaviour.
   */
  enemies?: Record<string, Enemy>;
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

  const distance = distanceXZ(enemy.position, targetPlayer.position);

  // Pack hunters circle instead of committing while they're still
  // alone on the target — the "wolves fan out, then all pile in"
  // beat. Lone mobs and out-of-patience packs fall straight through.
  if (holdForPack(enemy, targetPlayer.id, distance, context)) {
    circleTarget(enemy, targetPlayer, context);
    return;
  }

  // Stop where this mob wants to FIGHT, not where it can bite: a
  // caster with a bolt up settles at spell range, a melee mob still
  // closes to its reach (holdRangeFor collapses to attackRange).
  if (distance <= holdRangeFor(enemy, context.now)) {
    enemy.aiState = 'attacking';
    enemy.chaseStartedAt = undefined;
    stopEnemy(enemy);
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  moveEnemyTowardAt(enemy, targetPlayer.position, context.now, approachSpeedMul(enemy, context.now));
}

/** Rally gate — one bounded pack scan, only for archetypes that rally. */
function holdForPack(enemy: Enemy, targetId: string, distance: number, context: EnemyAIContext): boolean {
  if (policyFor(enemy).rallyAllies <= 0) return false;
  const nearbyIds = context.spatialGrid.queryCircle(
    { x: enemy.position.x, z: enemy.position.z },
    ENEMY_AI_TUNING.rallyScanRadiusM,
  );
  return shouldHoldForPack(enemy, scanPack(enemy, targetId, context.enemies, nearbyIds), distance, context.now);
}

/** Slide sideways around the target while keeping eyes on it. */
function circleTarget(enemy: Enemy, targetPlayer: PlayerState, context: EnemyAIContext): void {
  const policy = policyFor(enemy);
  const sign = enemy.aiRepositionSign ?? strafeSign(enemy, enemy.chaseStartedAt ?? context.now);
  enemy.aiRepositionSign = sign;
  const point = strafePoint(enemy, targetPlayer.position, sign, STRAFE_STEP_M);
  if (withinLeash(enemy, point, leashDistanceFor(enemy))) {
    moveEnemyTowardAt(enemy, point, context.now, policy.repositionSpeedMul);
  } else {
    stopEnemy(enemy);
  }
  faceEnemyToward(enemy, targetPlayer.position);
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

  // A support mob that's been worn down breaks off ONCE, falls back
  // toward spawn and screams the rest of the pack onto its attacker —
  // the fight changes shape instead of just draining a second HP bar.
  if (shouldRegroup(enemy)) {
    breakOffAndRally(enemy, targetPlayer.id, context, progress);
    return;
  }

  const distance = distanceXZ(enemy.position, targetPlayer.position);
  const holdRange = holdRangeFor(enemy, context.now);
  if (distance > holdRange * ENEMY_AI_TUNING.holdRangeSlackMul) {
    enemy.aiState = 'chasing';
    enemy.chaseStartedAt = context.now;
    progress.shouldBroadcastEnemyUpdate = true;
    return;
  }

  applyAttackIfReady(enemy, targetPlayer, distance, context, progress);
  applyFightPositioning(enemy, targetPlayer, distance, holdRange, context);
  faceEnemyToward(enemy, targetPlayer.position);
}

/** How far a strafing mob slides per reposition. */
const STRAFE_STEP_M = 4;

/**
 * Where the mob stands between swings. Three archetype behaviours, in
 * priority order: finish an in-flight flank dart, give ground while a
 * ranged option is up, otherwise plant and fight (today's behaviour,
 * which is what every brawler still does).
 */
function applyFightPositioning(
  enemy: Enemy,
  targetPlayer: PlayerState,
  distance: number,
  holdRange: number,
  context: EnemyAIContext,
): void {
  const policy = policyFor(enemy);
  const now = context.now;
  if (enemy.aiRepositionUntilTs !== undefined && enemy.aiRepositionUntilTs > now) {
    circleTarget(enemy, targetPlayer, context);
    return;
  }
  // Gated on actually HAVING something to throw: a melee-only starter
  // mob can never run away from a new player who closed on it.
  const shouldBackpedal = policy.backpedalWithinM > 0
    && distance < policy.backpedalWithinM
    && hasReadyRangedOption(enemy, now);
  if (shouldBackpedal) {
    const point = backpedalPoint(enemy, targetPlayer.position, holdRange);
    if (withinLeash(enemy, point, leashDistanceFor(enemy))) {
      moveEnemyTowardAt(enemy, point, now, policy.repositionSpeedMul);
      return;
    }
  }
  stopEnemy(enemy);
}

/** The retreat beat: disengage, suppress re-aggro briefly, call the pack. */
function breakOffAndRally(
  enemy: Enemy,
  targetId: string,
  context: EnemyAIContext,
  progress: EnemyAIProgress,
): void {
  enemy.hasRegrouped = true;
  enemy.targetId = null;
  enemy.chaseStartedAt = undefined;
  enemy.aiState = 'returning';
  enemy.aggroSuppressedUntilTs = context.now + ENEMY_AI_TUNING.regroupDisengageMs;
  stopEnemy(enemy);
  progress.events.push({ type: 'log', message: `[AI] Enemy ${enemy.id} broke off wounded and called for help` });
  if (enemy.packId) {
    progress.events.push({ type: 'packAggro', packId: enemy.packId, targetId, sourceEnemyId: enemy.id });
  }
  progress.shouldBroadcastEnemyUpdate = true;
}

function advanceReturningEnemy(enemy: Enemy, context: EnemyAIContext, progress: EnemyAIProgress): void {
  const distanceFromSpawn = distanceXZ(enemy.position, enemy.spawnPosition);
  if (distanceFromSpawn <= 1.0) {
    enemy.aiState = 'idle';
    snapEnemyToSpawn(enemy, context.spatialGrid);
    resetEncounterProgression(enemy);
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

/** Home again: the next fight starts from a clean behavioural slate. */
function resetEncounterProgression(enemy: Enemy): void {
  enemy.hasRegrouped = false;
  enemy.castsSinceReposition = 0;
  enemy.aiRepositionUntilTs = undefined;
  enemy.aiRepositionSign = undefined;
}

function isAggroSuppressed(enemy: Enemy, now: number): boolean {
  return enemy.aggroSuppressedUntilTs !== undefined && now < enemy.aggroSuppressedUntilTs;
}

function applyAttackIfReady(
  enemy: Enemy,
  targetPlayer: PlayerState,
  distance: number,
  context: EnemyAIContext,
  progress: EnemyAIProgress,
): void {
  const now = context.now;
  // Global attack cadence (attackCooldownMs). The actual hit/miss +
  // damage + effects resolve later this tick in the combat phase: the
  // emitter turns this intent into a real cast (castMobSkill) and
  // tickCasts resolves it through the same pipeline players use. The
  // enemy drops a target it has killed organically next tick (the dead
  // player is no longer a valid aggro target).
  if (now - enemy.lastAttackTime < enemy.attackCooldownMs) return;
  const skillId = selectMobSkillAtRange(enemy, now, distance, (radiusM) => woundedAllyNearby(enemy, radiusM, context));
  if (!skillId) return;
  enemy.lastAttackTime = now;
  progress.events.push({ type: 'castSkill', enemyId: enemy.id, targetId: targetPlayer.id, skillId });
  noteCastForReposition(enemy, now);
}

/** Bounded scan, only paid by mobs that actually carry an ally ability. */
function woundedAllyNearby(enemy: Enemy, radiusM: number, context: EnemyAIContext): boolean {
  const nearbyIds = context.spatialGrid.queryCircle({ x: enemy.position.x, z: enemy.position.z }, radiusM);
  return hasWoundedAlly(enemy, context.enemies, nearbyIds, radiusM);
}

/**
 * Skirmishers/pack hunters dart to a flank every `strafeAfterCasts`
 * swings, so they never stand where the player last aimed.
 */
function noteCastForReposition(enemy: Enemy, now: number): void {
  const policy = policyFor(enemy);
  if (policy.strafeAfterCasts <= 0) return;
  const casts = (enemy.castsSinceReposition ?? 0) + 1;
  if (casts < policy.strafeAfterCasts) {
    enemy.castsSinceReposition = casts;
    return;
  }
  enemy.castsSinceReposition = 0;
  enemy.aiRepositionUntilTs = now + policy.strafeMs;
  enemy.aiRepositionSign = strafeSign(enemy, now);
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
 * Both apply to `attackPower` (the source the boss's weapon-scaled
 * skills — basic strikes AND the signature — read), so escalation
 * lands on every ability. Reset on return-to-spawn / respawn.
 * (Signatures themselves are ordinary skills now — see bossSkills.ts.)
 */
function tickBossProgression(enemy: Enemy, now: number, progress: EnemyAIProgress): void {
  const cfg = enemy.bossConfig;
  if (!cfg) return;
  const inCombat = enemy.aiState === 'chasing' || enemy.aiState === 'attacking';
  if (inCombat && enemy.combatStartedTs === undefined) enemy.combatStartedTs = now;
  if (!enemy.enraged && enemy.combatStartedTs !== undefined && now - enemy.combatStartedTs >= cfg.enrageAfterMs) {
    enemy.enraged = true;
    applyBossDamageScaling(enemy);
    progress.events.push({ type: 'log', message: `[BOSS] ${enemy.name} enrages — damage now ${enemy.attackDamage.toFixed(1)}` });
    progress.shouldBroadcastEnemyUpdate = true;
  }
  if (!enemy.phaseShifted && enemy.health < enemy.maxHealth * cfg.phaseTwoHpFraction) {
    enemy.phaseShifted = true;
    applyBossDamageScaling(enemy);
    enemy.movementSpeed = (enemy.baseMovementSpeed ?? enemy.movementSpeed) * cfg.phaseTwoSpeedMul;
    // The phase break is a beat the player should FEEL: every ability
    // comes off cooldown at once (so the signature lands immediately
    // after the transition) and anything packed with the boss joins in.
    enemy.skillCooldownEndTs = {};
    if (enemy.packId && enemy.targetId) {
      progress.events.push({ type: 'packAggro', packId: enemy.packId, targetId: enemy.targetId, sourceEnemyId: enemy.id });
    }
    progress.events.push({ type: 'log', message: `[BOSS] ${enemy.name} phase 2 — speed ${enemy.movementSpeed.toFixed(1)}, damage ${enemy.attackDamage.toFixed(1)}` });
    progress.shouldBroadcastEnemyUpdate = true;
  }
}

/** Re-derive attackDamage + attackPower from base × the active enrage/phase muls. */
function applyBossDamageScaling(enemy: Enemy): void {
  const cfg = enemy.bossConfig;
  const base = enemy.baseAttackDamage ?? enemy.attackDamage;
  let mul = 1;
  if (cfg && enemy.enraged) mul *= cfg.enragedDamageMul;
  if (cfg && enemy.phaseShifted) mul *= cfg.phaseTwoDamageMul;
  enemy.attackDamage = base * mul;
  if (enemy.stats) enemy.stats.attackPower = base * mul;
}

function resetBossProgression(enemy: Enemy): void {
  enemy.combatStartedTs = undefined;
  enemy.enraged = false;
  enemy.phaseShifted = false;
  if (enemy.baseAttackDamage !== undefined) {
    enemy.attackDamage = enemy.baseAttackDamage;
    if (enemy.stats) enemy.stats.attackPower = enemy.baseAttackDamage;
  }
  if (enemy.baseMovementSpeed !== undefined) enemy.movementSpeed = enemy.baseMovementSpeed;
}

function markDirtyIfMotionChanged(
  enemy: Enemy,
  previousState: Enemy['aiState'],
  previousVelocity: { x: number; z: number },
): void {
  if (enemy.dirtySnap) {
    return;
  }

  const newVelocity = enemy.velocity || { x: 0, z: 0 };
  if (
    previousState !== enemy.aiState
    || Math.abs(previousVelocity.x - newVelocity.x) > 0.01
    || Math.abs(previousVelocity.z - newVelocity.z) > 0.01
  ) {
    markEnemyPositionDirty(enemy);
  }
}
