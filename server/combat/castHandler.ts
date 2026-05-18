import { classifySkill, SKILLS, type SkillId } from '../../packages/content/skills.js';
import { CastReq, CastFail } from '../../packages/protocol/messages.js';
import { PlayerState } from '../../packages/sim/entities.js';
import { debug, LOG_CATEGORIES, warn } from '../logger.js';
import { handleCastRequest } from './skillSystem.js';
import { tryInterruptForNewAction } from './castInterrupt.js';
import { isEntityStunned } from './statusQueries.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import type { ActiveCastStore } from './skillSystem.js';
import { applyCastResources, validateCastRequest } from './castRules.js';
import type { CombatWorld } from './worldContract.js';
import {
  emitPlayerUpdated,
  type DirectMessageSink,
  type OutboundEventSink,
} from '../transport/outboundEvents.js';

type CastFailReason = CastFail['reason'];
type CastRequestClient = { id: string };
type CastHandlerTransport = {
  direct: DirectMessageSink;
  outbound: OutboundEventSink;
};

/**
 * Handles a cast request from the client
 * Integration point between the world.ts and the new skillSystem.ts
 */
export function handleCastReq(
  socket: CastRequestClient,
  player: PlayerState,
  msg: CastReq,
  transport: CastHandlerTransport,
  world: CombatWorld,
  activeCasts: ActiveCastStore
): void {
  const playerId = msg.id;
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    warn(LOG_CATEGORIES.COMBAT, `Invalid cast request: player=${playerId}, socketId mismatch`);
    return;
  }

  const now = Date.now();

  // Stun blocks casting entirely. CastFail.reason has no 'stunned'
  // literal so we route through 'invalid' — clients see a generic cast
  // failure; the metric distinguishes the cause for operators.
  if (isEntityStunned(player, now)) {
    runtimeMetrics.increment('cast.rejectedStunned');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: player ${playerId} is stunned`);
    emitCastFail(transport.direct, msg, 'invalid');
    return;
  }

  // Cast-blocking gate: a different active cast belonging to this
  // player either gets interrupted (refund + clear) or blocks this
  // new cast outright. See castInterrupt.ts for the rules.
  const interrupt = tryInterruptForNewAction(player, activeCasts, transport.outbound, 'newCast');
  if (interrupt === 'block') {
    runtimeMetrics.increment('cast.rejectedBlocked');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: player ${playerId} is in a blocking cast`);
    emitCastFail(transport.direct, msg, 'invalid');
    return;
  }

  // Resolve target: enemies first, then other players (PvP). Casting
  // at yourself is rejected here — beneficial self-cast skills take
  // the no-target branch instead (impactResolver auto-targets caster).
  let target: ReturnType<typeof world.getEnemyById> | ReturnType<typeof world.getPlayerById> = null;
  if (msg.targetId) {
    target = world.getEnemyById(msg.targetId);
    if (!target) {
      const otherPlayer = world.getPlayerById(msg.targetId);
      target = otherPlayer && otherPlayer.id !== player.id ? otherPlayer : null;
    }
  }

  const castCheck = validateCastRequest(player, msg.skillId, target, msg.targetPos, now);
  if (castCheck.ok === false) {
    debug(LOG_CATEGORIES.COMBAT, `Cast failed for player ${playerId}`, {
      skillId: msg.skillId,
      reason: castCheck.reason,
    });
    emitCastFail(transport.direct, msg, castCheck.reason);
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
  });
  
  const failReason = typeof castResult === 'string' ? toCastFailReason(castResult) : null;
  if (failReason) {
    debug(LOG_CATEGORIES.COMBAT, `Cast failed for player ${playerId}`, {
      skillId: castCheck.skillId,
      reason: castResult,
    });
    emitCastFail(transport.direct, msg, failReason);
    return;
  }
  
  // If we got here, the cast was successful and castResult is the cast ID
  const resourceUpdate = applyCastResources(player, castCheck.skillId, castCheck.skill, now);

  emitPlayerUpdated(transport.outbound, {
    id: player.id,
    ...resourceUpdate,
  });
}

function emitCastFail(direct: DirectMessageSink, msg: CastReq, reason: CastFailReason): void {
  direct.send({
    type: 'CastFail',
    clientSeq: msg.clientTs,
    reason,
  } satisfies CastFail);
}

function toCastFailReason(reason: string): CastFailReason | null {
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
    emitCastFail(transport.direct, msg, 'invalid');
    return true;
  }
  if (align === 'harmful' && targetIsFriendlyPlayer) {
    runtimeMetrics.increment('cast.rejectedFriendlyFire.harmfulOnAlly');
    debug(LOG_CATEGORIES.COMBAT, `Cast rejected: harmful ${skillId} aimed at ally without force`);
    emitCastFail(transport.direct, msg, 'invalid');
    return true;
  }
  return false;
}
