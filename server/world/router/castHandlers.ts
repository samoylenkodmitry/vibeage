import type { ClientMessage } from '../../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../../packages/sim/entities.js';
import { handleCastReq } from '../../combat/castHandler.js';
import { createCombatWorld } from '../../combat/combatWorld.js';
import { handleTargetDeath } from '../../combat/targetDeath.js';
import { createEnemy } from '../../enemies/enemyLifecycle.js';
import { runtimeMetrics } from '../../observability/runtimeMetrics.js';
import type { SpatialHashGrid } from '../../spatial/SpatialHashGrid.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
} from '../../transport/outboundEvents.js';
import type { GameState } from '../../gameState.js';
import type { WorldClient } from './commandContext.js';

export function createWorldCombatBridge(
  state: GameState,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
) {
  return createCombatWorld(
    state,
    (caster, target, now) => handleTargetDeath(caster, target, { state, spatial, outbound, now }),
    (pos, radius) => queryAliveSpatialEntities(state, spatial, pos, radius),
    (type, level, pos, now, options) => {
      const minion = createEnemy(type, level, pos, now, options);
      state.enemies[minion.id] = minion;
      spatial.insert(minion.id, { x: pos.x, z: pos.z });
    },
    (id, oldPos, newPos) => spatial.move(id, oldPos, newPos),
  );
}

function queryAliveSpatialEntities(
  state: GameState,
  spatial: SpatialHashGrid,
  pos: Extract<ClientMessage, { type: 'MoveIntent' }>['targetPos'],
  radius: number,
): Array<Enemy | PlayerState> {
  return spatial.queryCircle(pos, radius)
    .map((id) => state.enemies[id] || state.players[id])
    .filter((entity): entity is Enemy | PlayerState => Boolean(entity?.isAlive));
}

export function onCastReq(
  socket: WorldClient,
  direct: DirectMessageSink,
  state: GameState,
  msg: Extract<ClientMessage, { type: 'CastReq' }>,
  outbound: OutboundEventSink,
  spatial: SpatialHashGrid,
): void {
  const player = state.players[msg.id];
  if (!player) {
    return;
  }
  if (player.socketId !== socket.id) {
    runtimeMetrics.increment('clientMessages.invalidOwnership.CastReq');
    runtimeMetrics.increment('clientMessages.invalidOwnership.total');
    return;
  }

  handleCastReq(
    socket,
    player,
    msg,
    { direct, outbound },
    createWorldCombatBridge(state, outbound, spatial),
    { activeCasts: state.activeCasts, now: Date.now() },
  );
}
