import {
  addCombatLine,
  applyBossTelegraphFeedback,
  applyEnemyAttackVisualState,
  makeCombatLineId,
} from './clientVisualState';
import type { ServerMessage } from '../../../packages/protocol/messages';
import type { GameClientState } from './gameTypes';

/**
 * The messages that only change how a fight *looks*: an incoming swing, a
 * boss winding up, a wind-up broken. Split out of `applyServerMessage` to
 * keep that dispatcher under the 100-line budget; returns null when the
 * message isn't one of these so the caller keeps walking its chain.
 */
export function applyCombatPresentationMessage(
  state: GameClientState,
  message: ServerMessage,
  now: number,
): GameClientState | null {
  if (message.type === 'EnemyAttack') return applyEnemyAttackVisualState(state, message, now);
  if (message.type === 'BossTelegraph') return applyBossTelegraph(state, message, now);
  if (message.type === 'CastInterrupted') return applyCastInterrupted(state, message, now);
  return null;
}

function applyBossTelegraph(
  state: GameClientState,
  message: ServerMessage & { type: 'BossTelegraph' },
  now: number,
): GameClientState {
  const entry = {
    enemyId: message.enemyId,
    bossName: message.bossName,
    abilityName: message.abilityName,
    x: message.x,
    z: message.z,
    radius: message.radius,
    innerRadius: message.innerRadius,
    directionRad: message.directionRad,
    halfAngleDeg: message.halfAngleDeg,
    startedAt: now,
    impactAt: message.impactAt,
    unstoppable: message.unstoppable,
  };
  // Replace any prior telegraph from the same enemy — a boss only
  // ever has one channel in flight at a time.
  const next = state.bossTelegraphs.filter((t) => t.enemyId !== message.enemyId);
  next.push(entry);
  // §49/M2 — also surface the ability start in the combat log so the
  // player gets a text confirmation alongside the ground-ring VFX.
  return applyBossTelegraphFeedback({ ...state, bossTelegraphs: next }, message, now);
}

/**
 * A mob's wind-up was broken by a control ability. Two jobs, and the
 * first one matters more than the text: retire the telegraph ring and
 * the cast bar *now*. Without that the ring keeps growing to an impact
 * that will never land, so a successful interrupt reads to the player
 * as one that failed — the exact opposite of what happened.
 *
 * The telegraph store is keyed by caster (a boss only ever has one
 * channel in flight), the cast store by castId; both are cleared.
 */
export function applyCastInterrupted(
  state: GameClientState,
  message: ServerMessage & { type: 'CastInterrupted' },
  now: number,
): GameClientState {
  const casts = { ...state.casts };
  delete casts[message.castId];
  const telegraphs = state.bossTelegraphs.filter((t) => t.enemyId !== message.casterId);
  const retired: GameClientState = {
    ...state,
    casts,
    bossTelegraphs: telegraphs.length === state.bossTelegraphs.length ? state.bossTelegraphs : telegraphs,
  };
  return addCombatLine(retired, {
    id: makeCombatLineId(`cast-interrupted-${message.castId}`, state.combatLog.length, now),
    text: describeInterrupt(message.casterName, message.abilityName, message.reason),
    // 'buff' is the log's colour for "a non-damaging utility landed" —
    // which is precisely what the player just pulled off.
    tone: 'buff',
  });
}

/**
 * Name the control effect that broke the cast, so the player learns
 * *which* of their tools did it and reaches for it again. Falls back
 * to a plain interrupt line for any reason the server adds later.
 */
function describeInterrupt(casterName: string, abilityName: string, reason: string): string {
  switch (reason) {
    case 'stun': return `${casterName} is stunned — ${abilityName} shatters!`;
    case 'silence': return `${casterName} is silenced — ${abilityName} shatters!`;
    case 'knockback': return `${casterName} is knocked off the mark — ${abilityName} shatters!`;
    default: return `${casterName}'s ${abilityName} is interrupted!`;
  }
}
