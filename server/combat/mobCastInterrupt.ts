import { CastState as CastStateEnum } from '../../packages/protocol/messages.js';
import { SKILLS } from '../../packages/content/skills.js';
import { MOB_CAST_INTERRUPT } from '../../packages/content/enemiesAi.js';
import type { Enemy } from '../../packages/sim/entities.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import { emitServerMessage, type OutboundEventSink } from '../transport/outboundEvents.js';
import { isEntitySilenced, isEntityStunned } from './statusQueries.js';
import type { Cast, ActiveCastStore } from './skillSystem.js';
import type { CombatWorld } from './worldContract.js';

/**
 * Mob cast interruption.
 *
 * A telegraphed mob ability used to have exactly one counterplay —
 * walk out of the shape — because `castInterrupt.ts` only ever looked
 * at players. Every stun, freeze, root, silence and knockback a player
 * owns bounced off a winding-up brute and the cleave landed anyway.
 *
 * The rule here is deliberately the SAME rule players live under, not
 * a second rulebook:
 *   - `SkillDef.isInterruptable === false` opts an ability out (that is
 *     already how a player's Escape channel survives a nudge); a boss
 *     signature that must never be stopped says so as ability data.
 *   - Anything else winding up is fair game.
 *
 * What differs is the *trigger*. A player's cast is interrupted by
 * their own conflicting input (move / re-cast); a mob has no input, so
 * the trigger is the control effect itself. The sweep runs from
 * `tickCasts` so it catches control from every source — a direct stun,
 * an AOE that happens to clip the caster, a DoT-applied silence —
 * without each of those paths knowing casts exist.
 */

/** Why a wind-up broke. Wire-visible: the client prints it. */
export type MobInterruptReason = 'stun' | 'silence' | 'knockback';

/**
 * The control effect currently breaking `enemy`'s cast, or null.
 *
 * Stun/freeze/root/timeStop share one predicate with movement and the
 * AI (`isEntityStunned`) so "can't act" means one thing everywhere.
 * Knockback leaves no status effect — it is a one-shot shove — so it
 * is read off `lastDisplacedTs`: a mob pushed after its wind-up began
 * is no longer standing where the telegraph was locked.
 */
export function mobInterruptReason(enemy: Enemy, cast: Cast, now: number): MobInterruptReason | null {
  if (isEntityStunned(enemy, now)) return 'stun';
  if (isEntitySilenced(enemy, now)) return 'silence';
  if ((enemy.lastDisplacedTs ?? 0) >= cast.startedAt) return 'knockback';
  return null;
}

/**
 * Consequence of a broken wind-up, in that order of importance:
 *
 *   1. The cast never resolves — no damage, no shape, no telegraph.
 *   2. The ability eats `MOB_CAST_INTERRUPT.cooldownFraction` of its
 *      own cooldown, so the interrupt bought real time rather than a
 *      free re-cast on the next tick.
 *   3. The mob is staggered for `staggerMs` before it swings at all,
 *      by pushing its global attack cadence forward. Without this the
 *      brute flows straight from a failed cleave into a basic attack
 *      and the interrupt reads as nothing having happened.
 */
function applyInterruptConsequence(enemy: Enemy, cast: Cast, now: number): void {
  const skill = SKILLS[cast.skillId];
  const cooldownMs = Math.round((skill?.cooldownMs ?? 0) * MOB_CAST_INTERRUPT.cooldownFraction);
  if (!enemy.skillCooldownEndTs) enemy.skillCooldownEndTs = {};
  enemy.skillCooldownEndTs[cast.skillId] = now + cooldownMs;
  // `lastAttackTime` gates every mob action through attackCooldownMs;
  // dating it into the future is how a stagger is expressed without
  // inventing a second timer the AI would also have to consult.
  enemy.lastAttackTime = now - enemy.attackCooldownMs + MOB_CAST_INTERRUPT.staggerMs;
}

/**
 * Break `cast` and tell everyone watching. Returns false when the
 * ability is uninterruptible, so the caller leaves the wind-up alone.
 */
export function interruptMobCast(
  enemy: Enemy,
  cast: Cast,
  reason: MobInterruptReason,
  outbound: OutboundEventSink,
  activeCasts: ActiveCastStore,
  now: number,
): boolean {
  const skill = SKILLS[cast.skillId];
  // Same default-on flag players use: an ability is interruptable
  // unless its data explicitly opted out.
  if (skill?.isInterruptable === false) return false;

  delete activeCasts[cast.castId];
  applyInterruptConsequence(enemy, cast, now);

  // The client is mid-telegraph: without this the ring keeps growing
  // to an impact that will never come, and an interrupted cast reads
  // as one that quietly never happened.
  emitServerMessage(outbound, {
    type: 'CastInterrupted',
    castId: cast.castId,
    casterId: enemy.id,
    casterName: enemy.name,
    skillId: cast.skillId,
    abilityName: skill?.name ?? cast.skillId,
    reason,
    ...(cast.targetId ? { interrupterId: cast.targetId } : {}),
  });
  debug(LOG_CATEGORIES.COMBAT, `Mob cast ${cast.castId} interrupted (${reason}); enemy ${enemy.id}`);
  return true;
}

/**
 * Per-tick sweep over every mob cast still in its wind-up. Called from
 * `tickCasts` before progress is advanced, so an interrupted cast never
 * gets one more frame of telegraph.
 */
export function interruptControlledMobCasts(
  activeCasts: ActiveCastStore,
  outbound: OutboundEventSink,
  world: CombatWorld,
  now: number,
): void {
  for (const castId of Object.keys(activeCasts)) {
    const cast = activeCasts[castId];
    if (cast.state !== CastStateEnum.Casting) continue;
    const enemy = world.getEnemyById(cast.casterId);
    if (!enemy) continue; // player cast — castInterrupt.ts owns those.
    const reason = mobInterruptReason(enemy, cast, now);
    if (!reason) continue;
    interruptMobCast(enemy, cast, reason, outbound, activeCasts, now);
  }
}
