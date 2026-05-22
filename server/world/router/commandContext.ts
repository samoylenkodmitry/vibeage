import type { GameState } from '../../gameState.js';
import type { SpatialHashGrid } from '../../spatial/SpatialHashGrid.js';
import type {
  DirectMessageSink,
  OutboundEventSink,
  SocketMessageTarget,
} from '../../transport/outboundEvents.js';

export type WorldClient = SocketMessageTarget & { id: string };

export interface CommandContext {
  readonly socket: WorldClient;
  readonly direct: DirectMessageSink;
  readonly state: GameState;
  readonly outbound: OutboundEventSink;
  readonly spatial: SpatialHashGrid;
}
