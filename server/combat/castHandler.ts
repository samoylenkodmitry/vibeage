import { classifySkill, SKILLS, type SkillId } from '../../packages/content/skills.js';
import { CastReq } from '../../packages/protocol/messages.js';
import { hash, rng as makeRng } from '../../packages/sim/combatMath.js';
import { type Enemy, PlayerState } from '../../packages/sim/entities.js';
import { debug, LOG_CATEGORIES, warn } from '../logger.js';
import { handleCastRequest } from './skillSystem.js';
import { tryInterruptForNewAction } from './castInterrupt.js';
import { isEntitySilenced, isEntityStunned } from './statusQueries.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import type { ActiveCastStore } from './skillSystem.js';
import { applyCastResources, validateCastRequest } from './castRules.js';
import type { CombatWorld } from './worldContract.js';
import { sendCommandRejected } from '../transport/commandRejected.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';

// §52 #1 — kept as a stable union for the cast pipeline's internal
// validation. Pre-retirement this was derived from `CastFail['reason']`;
// inlined now that the wire-side `CastFail` type is gone.
type CastRejectionReason = 'cooldown' | 'nomana' | 'invalid' | 'outofrange';
type CastRequestClient = { id: string };
type CastHandlerTransport = {
  direct: DirectMessageSink;
  outbound: OutboundEventSink;
};

/**
 * Handles a cast request from the client
 * Integration point between the world.ts and the new skillSystem.ts
 */
/** The cast store + the server clock for this request — bundled to keep
 *  the handler's surface within the maintainability param budget. */
export type CastRuntime = { activeCasts: ActiveCastStore; now: number };

export function handleCastReq(
  socket: CastRequestClient,
  player: PlayerState,
  msg: CastReq,
  transport: CastHandlerTransport,
  world: CombatWorld,
  runtime: CastRuntime,
): void {
  const { activeCasts, now } = runtime;
  const playerId = msg.id;
  // §52 #5 — count every CastReq the handler sees. Pair with
  // `castReq.accepted` below so the accept-rate (accepted/received)
  // can be graphed; a sudden drop is the cheapest signal that
  // something broke the cast pipeline (e.g. the PR #338 regression).
  runtimeMetrics.increment('castReq.received');

  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    warn(LOG_CATEGORIES.COMBAT, `Invalid cast request: player=${playerId}, socketId mismatch`);
    runtimeMetrics.increment('castReq.rejected.socketMismatch');
    return;
  }

  // Stun blocks casting entirely. CastFail.reason has no 'stunned'
  // literal so we route through 'invalid' — clients see a generic cast
  // failure; the metric distinguishes the cause for operators.
  if (isEntityStunned(player, now)) {
    runtimeMetrics.increment('cast.rejectedStunned');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: player ${playerId} is stunned`);
    sendCastRejected(transport.direct, msg, 'invalid');
    return;
  }
  if (isEntitySilenced(player, now)) {
    runtimeMetrics.increment('cast.rejectedSilenced');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: player ${playerId} is silenced`);
    sendCastRejected(transport.direct, msg, 'invalid');
    return;
  }

  // Cast-blocking gate: a different active cast belonging to this
  // player either gets interrupted (refund + clear) or blocks this
  // new cast outright. See castInterrupt.ts for the rules.
  const interrupt = tryInterruptForNewAction(
    player, activeCasts, transport.outbound, 'newCast',
    makeRng(hash(`interrupt:${player.id}:${now}`)),
  );
  if (interrupt === 'block') {
    runtimeMetrics.increment('cast.rejectedBlocked');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: player ${playerId} is in a blocking cast`);
    sendCastRejected(transport.direct, msg, 'invalid');
    return;
  }

  const target = resolveCastTarget(player, msg, world);
  const castCheck = validateCastRequest(player, msg.skillId, target, msg.targetPos, now);
  if (castCheck.ok === false) {
    debug(LOG_CATEGORIES.COMBAT, `Cast failed for player ${playerId}`, {
      skillId: msg.skillId,
      reason: castCheck.reason,
    });
    sendCastRejected(transport.direct, msg, castCheck.reason);
    return;
  }

  if (rejectFriendlyFire(player, msg, castCheck.skillId, target, world, transport)) return;
  
  // Create a cast using the server authoritative skill system
  const castResult = handleCastRequest({
    activeCasts,
    player,
    casterId: playerId,
    skillId: castCheck.skillId,
    targetPos: msg.targetPos,
    targetId: msg.targetId,
    outbound: transport.outbound,
    world,
    now,
  });
  
  const failReason = typeof castResult === 'string' ? toCastRejectionReason(castResult) : null;
  if (failReason) {
    debug(LOG_CATEGORIES.COMBAT, `Cast failed for player ${playerId}`, {
      skillId: castCheck.skillId,
      reason: castResult,
    });
    sendCastRejected(transport.direct, msg, failReason);
    return;
  }
  
  // If we got here, the cast was successful and castResult is the cast ID
  const resourceUpdate = applyCastResources(player, castCheck.skillId, castCheck.skill, now);

  emitPlayerUpdated(transport.outbound, {
    id: player.id,
    ...resourceUpdate,
  });
  runtimeMetrics.increment('castReq.accepted');
}

/**
 * Resolve a CastReq's target: enemies first, then other players (PvP).
 * Casting at yourself returns null — beneficial self-cast skills take
 * the no-target branch (impactResolver auto-targets the caster).
 */
function resolveCastTarget(
  player: PlayerState,
  msg: CastReq,
  world: CombatWorld,
): Enemy | PlayerState | null {
  if (!msg.targetId) return null;
  const enemy = world.getEnemyById(msg.targetId);
  if (enemy) return enemy;
  const otherPlayer = world.getPlayerById(msg.targetId);
  return otherPlayer && otherPlayer.id !== player.id ? otherPlayer : null;
}

function sendCastRejected(direct: DirectMessageSink, msg: CastReq, reason: CastRejectionReason): void {
  // §52 #1 follow-up — `CastFail` retired. The `CommandRejected`
  // envelope is now the sole channel for cast-side failures.
  // `requestId` prefers the explicit `clientSeq`; falls back to
  // `clientTs` for older clients that haven't migrated yet — the
  // same ack-key fallback `sendCastRejected` carried before retirement,
  // preserved so ack routing on legacy clients still hits.
  const ackKey = msg.clientSeq ?? msg.clientTs;
  sendCommandRejected(direct, 'CastReq', reason, ackKey);
}

function toCastRejectionReason(reason: string): CastRejectionReason | null {
  if (reason === 'cooldown' || reason === 'nomana' || reason === 'invalid' || reason === 'outofrange') {
    return reason;
  }

  if (reason === 'missingTarget' || reason === 'targetNotFound') {
    return 'invalid';
  }

  return null;
}

/**
 * PR X — friendly-fire / beneficial-on-enemy gate. Beneficial skills
 * aimed at enemies and harmful skills aimed at friendly players are
 * silently dropped unless the client opts in with `force` (Ctrl).
 * Self-cast and no-target casts are unaffected. Returns true when
 * the cast was rejected (caller should bail).
 */
function rejectFriendlyFire(
  player: PlayerState,
  msg: CastReq,
  skillId: SkillId,
  target: ReturnType<CombatWorld['getEnemyById']> | ReturnType<CombatWorld['getPlayerById']>,
  world: CombatWorld,
  transport: CastHandlerTransport,
): boolean {
  if (msg.force || !target) return false;
  const skill = SKILLS[skillId];
  const align = classifySkill(skill?.effects ?? []);
  const targetIsEnemy = world.getEnemyById(msg.targetId ?? '') !== null;
  const targetIsFriendlyPlayer = !targetIsEnemy && msg.targetId !== player.id
    && world.getPlayerById(msg.targetId ?? '') !== null;
  if (align === 'beneficial' && targetIsEnemy) {
    runtimeMetrics.increment('cast.rejectedFriendlyFire.beneficialOnEnemy');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: beneficial ${skillId} aimed at enemy without force`);
    sendCastRejected(transport.direct, msg, 'invalid');
    return true;
  }
  if (align === 'harmful' && targetIsFriendlyPlayer) {
    runtimeMetrics.increment('cast.rejectedFriendlyFire.harmfulOnAlly');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: harmful ${skillId} aimed at ally without force`);
    sendCastRejected(transport.direct, msg, 'invalid');
    return true;
  }
  return false;
}
