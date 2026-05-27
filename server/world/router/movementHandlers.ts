import type { ClientMessage } from '../../../packages/protocol/messages.js';
import { tryInterruptForNewAction } from '../../combat/castInterrupt.js';
import { debug, LOG_CATEGORIES, warn } from '../../logger.js';
import { applyMoveIntent } from '../../movement/moveIntent.js';
import { sharedMovementFreshness, type StaleIntentReason } from '../../movement/staleIntentTracker.js';
import { runtimeMetrics } from '../../observability/runtimeMetrics.js';
import type { OutboundEventSink } from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

export function onMoveIntent(
  socket: WorldClient,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'MoveIntent' }>,
  outbound: OutboundEventSink,
): void {
  const staleReason = sharedMovementFreshness().check(socket.id, msg.clientTs);
  if (staleReason) {
    incrementStaleMovementCounter(staleReason);
    debug(LOG_CATEGORIES.MOVEMENT, `Dropped stale MoveIntent from ${socket.id}: ${staleReason}`);
    return;
  }

  // Movement during a blocking cast either interrupts it (refund +
  // clear cooldown) or is dropped if the cast is non-interruptable.
  // See server/combat/castInterrupt.ts.
  const player = state.players[msg.id];
  if (player && player.castingSkill) {
    const verdict = tryInterruptForNewAction(player, state.activeCasts, outbound, 'movement');
    if (verdict === 'block') {
      debug(LOG_CATEGORIES.MOVEMENT, `MoveIntent rejected: player ${msg.id} is in a non-interruptable cast`);
      return;
    }
  }

  const result = applyMoveIntent(state, socket.id, msg, Date.now());

  if (result.ok === false) {
    warnRejectedMoveIntent(result.reason, result.playerId, msg.targetPos);
    return;
  }

  if (result.kind === 'move') {
    debug(LOG_CATEGORIES.MOVEMENT, `Player ${result.playerId} moving`, {
      targetPos: msg.targetPos,
      speed: result.speed,
    });
  }
}

function incrementStaleMovementCounter(reason: StaleIntentReason): void {
  runtimeMetrics.increment(`movement.staleIntent.${reason}`);
  runtimeMetrics.increment('movement.staleIntent.total');
}

function warnRejectedMoveIntent(
  reason: 'playerNotFound' | 'socketMismatch' | 'invalidTarget' | 'stunned' | 'dead',
  playerId: string,
  targetPos: Extract<ClientMessage, { type: 'MoveIntent' }>['targetPos'],
): void {
  if (reason === 'invalidTarget') {
    warn(LOG_CATEGORIES.MOVEMENT, `Invalid target position in MoveIntent from player ${playerId}`, { targetPos });
    return;
  }

  if (reason === 'stunned') {
    runtimeMetrics.increment('movement.rejectedStunned');
    debug(LOG_CATEGORIES.MOVEMENT, `MoveIntent rejected: player ${playerId} is stunned`);
    return;
  }

  if (reason === 'dead') {
    runtimeMetrics.increment('movement.rejectedDead');
    debug(LOG_CATEGORIES.MOVEMENT, `MoveIntent rejected: player ${playerId} is dead`);
    return;
  }

  if (reason === 'socketMismatch') {
    runtimeMetrics.increment('clientMessages.invalidOwnership.MoveIntent');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
  }

  warn(LOG_CATEGORIES.MOVEMENT, `Invalid player ID or wrong socket for MoveIntent: ${playerId}`);
}
