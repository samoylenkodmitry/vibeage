import { CastReq, CastFail } from '../../packages/protocol/messages.js';
import { PlayerState } from '../../packages/sim/entities.js';
import { debug, LOG_CATEGORIES, warn } from '../logger.js';
import { handleCastRequest } from './skillSystem.js';
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
  
  // Get target if any
  const target = msg.targetId ? world.getEnemyById(msg.targetId) : null;
  const now = Date.now();
  
  const castCheck = validateCastRequest(player, msg.skillId, target, msg.targetPos, now);
  if (castCheck.ok === false) {
    debug(LOG_CATEGORIES.COMBAT, `Cast failed for player ${playerId}`, {
      skillId: msg.skillId,
      reason: castCheck.reason,
    });
    emitCastFail(transport.direct, msg, castCheck.reason);
    return;
  }
  
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
