import type { CastSnapshot } from '../../packages/sim/entities.js';
import { emitServerMessage, type DirectMessageSink, type OutboundEventSink } from '../transport/outboundEvents.js';
import type { Cast } from './skillSystem.js';

export function makeCastSnapshot(cast: Cast): CastSnapshot {
  return {
    castId: cast.castId,
    casterId: cast.casterId,
    skillId: cast.skillId,
    state: cast.state,
    startedAt: cast.startedAt,
    castTimeMs: cast.castTimeMs,
    progressMs: cast.progressMs || 0,
    origin: cast.origin,
    pos: cast.pos,
    dir: cast.dir,
  };
}

export function emitCastSnapshot(outbound: OutboundEventSink, cast: Cast): void {
  emitServerMessage(outbound, {
    type: 'CastSnapshot',
    data: makeCastSnapshot(cast),
  });
}

export function sendCastSnapshotToClient(client: DirectMessageSink, cast: Cast): void {
  client.send({
    type: 'CastSnapshot',
    data: makeCastSnapshot(cast),
  });
}
