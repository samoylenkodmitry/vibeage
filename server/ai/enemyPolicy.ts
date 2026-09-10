import type { Enemy } from '../../packages/sim/entities.js';
import type { VecXZ } from '../../packages/protocol/messages.js';
import type { SkillId } from '../../packages/content/skills.js';
import { SKILLS, type SkillDef } from '../../packages/content/skills.js';
import {
  ENEMY_AI_TUNING,
  enemyAiPolicyForType,
  type EnemyAiPolicy,
} from '../../packages/content/enemiesAi.js';
import { distanceXZ } from '../../packages/sim/geometry.js';
import { hash, rng as makeRng } from '../../packages/sim/combatMath.js';
import { isEntitySilenced } from '../combat/statusQueries.js';

/**
 * The behaviour half of the encounter-variety pass: pure helpers that
 * turn a mob's archetype policy (content) + its current situation into
 * "where do I want to stand and what do I want to cast". The state
 * machine stays a state machine; everything that makes a caster read
 * differently from a brute is decided here, from data.
 *
 * Every helper is a pure function of (enemy, world snapshot, now) so
 * the whole thing replays identically on a SimClock, and each one is
 * O(mob skills) or a single bounded spatial query — an AI tick must
 * stay cheap however big the world gets.
 */

/**
 * Policies are immutable content keyed by mob type, so resolving one is
 * a map lookup per call; memoised anyway because the AI phase asks
 * several times per mob per tick.
 */
const POLICY_CACHE = new Map<string, EnemyAiPolicy>();

export function policyFor(enemy: Enemy): EnemyAiPolicy {
  const cached = POLICY_CACHE.get(enemy.type);
  if (cached) return cached;
  const policy = enemyAiPolicyForType(enemy.type);
  POLICY_CACHE.set(enemy.type, policy);
  return policy;
}

function isReady(enemy: Enemy, id: SkillId, now: number, silenced: boolean): boolean {
  if (silenced && id !== 'mobStrike') return false;
  return (enemy.skillCooldownEndTs?.[id] ?? 0) <= now;
}

/**
 * The first ready ability whose range actually covers `distance`. This
 * is what lets a mob hold at range and still act: a caster at 12m skips
 * its 2m strike instead of "attacking" thin air, and closes in (see
 * `holdRangeFor`) only once nothing ranged is left to throw.
 */
export function selectMobSkillAtRange(
  enemy: Enemy,
  now: number,
  distance: number,
  hasWoundedAllyWithin?: (radiusM: number) => boolean,
): SkillId | null {
  const silenced = isEntitySilenced(enemy, now);
  for (const id of enemy.skills ?? []) {
    if (!isReady(enemy, id, now, silenced)) continue;
    if (skillReach(enemy, id) < distance) continue;
    if (!wouldHelpAnyone(id, hasWoundedAllyWithin)) continue;
    return id;
  }
  return null;
}

/**
 * An ally-targeting ability (a mender's pulse) is only worth a swing
 * when someone in range actually needs it — otherwise a lone support
 * mob spends its whole fight healing nobody instead of attacking.
 * Generic on `affects`, so any future ally ability inherits the rule.
 */
function wouldHelpAnyone(id: SkillId, hasWoundedAllyWithin?: (radiusM: number) => boolean): boolean {
  const skill = SKILLS[id];
  if (!skill || skill.affects !== 'allies' || !hasWoundedAllyWithin) return true;
  const shape = skill.shape;
  return hasWoundedAllyWithin(shape && shape.kind !== 'single' ? shapeReach(shape) : (skill.range ?? 0));
}

function shapeReach(shape: NonNullable<SkillDef['shape']>): number {
  if (shape.kind === 'circle') return shape.radius;
  if (shape.kind === 'donut') return shape.outerRadius;
  if (shape.kind === 'cone') return shape.length;
  return 0;
}

/** Any living packmate in radius that a heal would actually top up. */
export function hasWoundedAlly(
  enemy: Enemy,
  enemies: Record<string, Enemy> | undefined,
  nearbyIds: readonly string[],
  radiusM: number,
): boolean {
  if (!enemies) return false;
  for (const id of nearbyIds) {
    const other = enemies[id];
    if (!other || other.id === enemy.id || !other.isAlive) continue;
    if (other.health >= other.maxHealth) continue;
    if (distanceXZ(enemy.position, other.position) <= radiusM) return true;
  }
  return false;
}

/** A skill's effective reach for this mob — never shorter than its bite. */
function skillReach(enemy: Enemy, id: SkillId): number {
  return Math.max(enemy.attackRange, SKILLS[id]?.range ?? 0);
}

/** Longest reach among the abilities the mob can use right now. */
function longestReadyReach(enemy: Enemy, now: number): number {
  const silenced = isEntitySilenced(enemy, now);
  let best = 0;
  for (const id of enemy.skills ?? []) {
    if (!isReady(enemy, id, now, silenced)) continue;
    const reach = skillReach(enemy, id);
    if (reach > best) best = reach;
  }
  return best;
}

/**
 * The distance this mob wants to fight at. A melee-only mob lands on
 * its bite range (unchanged behaviour); a caster holds most of its
 * spell range while that spell is up and walks straight back in when it
 * isn't — which is what makes a kiting mob feel like a decision rather
 * than a wall.
 */
export function holdRangeFor(enemy: Enemy, now: number): number {
  const policy = policyFor(enemy);
  const reach = longestReadyReach(enemy, now);
  if (reach <= enemy.attackRange) return enemy.attackRange;
  return Math.max(enemy.attackRange, reach * policy.holdRangeFraction);
}

/** True while the mob still has something to throw from outside melee. */
export function hasReadyRangedOption(enemy: Enemy, now: number): boolean {
  return longestReadyReach(enemy, now) > enemy.attackRange;
}

/**
 * Charge: a brute that has just spotted you sprints for `chargeMs`.
 * Deliberately a burst rather than a permanent speed buff so the tell
 * is "it broke into a run at me", not "this mob is fast".
 */
export function approachSpeedMul(enemy: Enemy, now: number): number {
  const policy = policyFor(enemy);
  if (policy.chargeMs <= 0 || enemy.chaseStartedAt === undefined) return 1;
  return now - enemy.chaseStartedAt < policy.chargeMs ? policy.chargeSpeedMul : 1;
}

/** A point `range` metres from the target, on the far side from it. */
export function backpedalPoint(enemy: Enemy, targetPos: VecXZ, range: number): VecXZ {
  const dx = enemy.position.x - targetPos.x;
  const dz = enemy.position.z - targetPos.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 0.01 ? dx / dist : 1;
  const uz = dist > 0.01 ? dz / dist : 0;
  return { x: targetPos.x + ux * range, z: targetPos.z + uz * range };
}

/** A point off to one side of the mob's facing — the flank dart. */
export function strafePoint(enemy: Enemy, targetPos: VecXZ, sign: number, stepM: number): VecXZ {
  const dx = targetPos.x - enemy.position.x;
  const dz = targetPos.z - enemy.position.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 0.01 ? dx / dist : 1;
  const uz = dist > 0.01 ? dz / dist : 0;
  // Perpendicular to the line of engagement, so the mob circles the
  // player rather than backing off — a flank, not a retreat.
  return { x: enemy.position.x - uz * sign * stepM, z: enemy.position.z + ux * sign * stepM };
}

/**
 * Which way this mob slides. Seeded on (id, reposition start) so a
 * replay strafes identically — never ambient Math.random.
 */
export function strafeSign(enemy: Enemy, startedAt: number): number {
  return makeRng(hash(`strafe:${enemy.id}:${startedAt}`))() < 0.5 ? -1 : 1;
}

/** Would moving here drag the mob past its leash? Then it stands its ground. */
export function withinLeash(enemy: Enemy, point: VecXZ, leashM: number): boolean {
  return distanceXZ(point, enemy.spawnPosition) <= leashM;
}

export type PackSnapshot = {
  /** Living packmates within the rally scan radius (excluding self). */
  nearby: number;
  /** …of those, how many are already chasing/attacking the same target. */
  engaged: number;
};

/**
 * One bounded spatial query per rallying mob per tick — pack hunters
 * are the only archetype that pays for it, and only while closing.
 */
export function scanPack(
  enemy: Enemy,
  targetId: string,
  enemies: Record<string, Enemy> | undefined,
  nearbyIds: readonly string[],
): PackSnapshot {
  if (!enemies || !enemy.packId) return { nearby: 0, engaged: 0 };
  let nearby = 0;
  let engaged = 0;
  for (const id of nearbyIds) {
    const other = enemies[id];
    if (!other || other.id === enemy.id || !other.isAlive || other.packId !== enemy.packId) continue;
    nearby += 1;
    if (other.targetId === targetId && (other.aiState === 'chasing' || other.aiState === 'attacking')) engaged += 1;
  }
  return { nearby, engaged };
}

/**
 * Hold-for-the-pack gate. A lone mob never waits (`nearby === 0`), and
 * patience is capped so a fight can't stall into a staring contest.
 */
export function shouldHoldForPack(enemy: Enemy, pack: PackSnapshot, distance: number, now: number): boolean {
  const policy = policyFor(enemy);
  if (policy.rallyAllies <= 0 || pack.nearby === 0) return false;
  if (pack.engaged >= policy.rallyAllies) return false;
  if (distance > ENEMY_AI_TUNING.rallyHoldRangeM) return false;
  const since = now - (enemy.chaseStartedAt ?? now);
  return since < ENEMY_AI_TUNING.rallyPatienceMs;
}

/** Wounded past its nerve, and hasn't already broken off this life. */
export function shouldRegroup(enemy: Enemy): boolean {
  const policy = policyFor(enemy);
  if (policy.regroupHpFraction <= 0 || enemy.hasRegrouped) return false;
  return enemy.health < enemy.maxHealth * policy.regroupHpFraction;
}
