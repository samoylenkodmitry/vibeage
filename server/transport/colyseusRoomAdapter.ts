import {
  describeProtocolError,
  safeParseClientMessage,
  type ServerMessage,
  type ClientMessage,
} from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import type {
  AuthoritativeRoomClient,
  AuthoritativeRoomPort,
  WorldRoomJoinOptions,
} from './roomBoundary.js';
import { MIN_CLIENT_PROTOCOL_VERSION, SOCKET_SESSION_EVENTS } from './roomBoundary.js';
import type { OutboundEvent, OutboundEventSink, PlayerUpdate } from './outboundEvents.js';
import { WORLD_BROADCAST_EVENTS } from './outboundEvents.js';
import {
  sanitizePlayerUpdateForPublic,
} from './clientState.js';
import { runtimeMetrics } from '../observability/runtimeMetrics.js';
import { verifySessionToken } from '../auth/sessionTokens.js';
import {
  createSocketPlayerLookup,
  getEntityRegionId,
  getPlayerStreamRegionIdsForPlayer,
  getPositionRegionId,
  type ServerWorldRegion,
  type SocketPlayerLookup,
} from '../world/regions.js';

export type ColyseusClientLike = {
  sessionId: string;
  send(type: string, message?: unknown): unknown;
};

export type ColyseusBroadcastLike = {
  clients?: Iterable<ColyseusClientLike>;
  broadcast(type: string, message?: unknown): unknown;
};

export type ColyseusVisibilitySource = {
  getGameState(): GameState | undefined;
  getRegions(): readonly ServerWorldRegion[] | undefined;
};

type VisibilityContext = {
  state: GameState;
  regions: readonly ServerWorldRegion[];
  playerIdsBySocket: SocketPlayerLookup;
};

type ClientVisibilityContext = {
  client: ColyseusClientLike;
  socketId: string;
  visibleRegionIds: ReadonlySet<string>;
};

export class ColyseusAuthoritativeRoomAdapter {
  constructor(private readonly port: AuthoritativeRoomPort) {}

  async handleJoin(client: ColyseusClientLike, options: WorldRoomJoinOptions): Promise<{ playerId: string }> {
    const clientVersion = options.clientProtocolVersion ?? 1;
    if (clientVersion < MIN_CLIENT_PROTOCOL_VERSION) {
      client.send(SOCKET_SESSION_EVENTS.connectionRejected, {
        reason: 'outdatedProtocol',
        message: `This server requires protocol v${MIN_CLIENT_PROTOCOL_VERSION} or higher.`,
      });
      runtimeMetrics.increment('room.joinRejected.outdatedProtocol');
      throw new Error(`Rejected outdated protocol version ${clientVersion}`);
    }

    const playerName = options.playerName?.trim() || 'Player';
    // PR I: world join now requires a valid session token issued by
    // /api/auth/{login,register}. Reject anything else so we don't
    // accidentally let an unauthenticated socket spawn a player.
    const session = options.sessionToken ? verifySessionToken(options.sessionToken) : null;
    if (!session) {
      client.send(SOCKET_SESSION_EVENTS.connectionRejected, {
        reason: 'unauthorized',
        message: 'Please log in to enter the world.',
      });
      runtimeMetrics.increment('room.joinRejected.unauthorized');
      throw new Error('Rejected join: missing or invalid session token');
    }
    const result = await this.port.joinClient(
      client.sessionId,
      playerName,
      makeColyseusClient(client),
      { initialRace: options.initialRace, initialClass: options.initialClass, accountId: session.accountId },
    );
    runtimeMetrics.increment('room.joins');
    return result;
  }

  async handleLeave(client: ColyseusClientLike): Promise<string | undefined> {
    const playerId = await this.port.leaveClient(client.sessionId);
    if (playerId) {
      runtimeMetrics.increment('room.leaves');
    }
    return playerId;
  }

  handleMessage(client: ColyseusClientLike, message: unknown): boolean {
    const parsed = safeParseClientMessage(message);
    if (!parsed.success) {
      console.warn(`Rejected invalid Colyseus client message from ${client.sessionId}: ${describeProtocolError(parsed.error)}`);
      runtimeMetrics.increment('clientMessages.rejected');
      return false;
    }

    runtimeMetrics.increment('clientMessages.accepted');
    runtimeMetrics.increment(`clientMessages.type.${parsed.data.type}`);
    this.dispatchCommand(client, parsed.data);
    return true;
  }

  dispatchCommand(client: ColyseusClientLike, command: ClientMessage): void {
    this.port.dispatchCommand(client.sessionId, command, makeColyseusClient(client));
  }
}

export function makeColyseusOutbound(
  room: ColyseusBroadcastLike,
  visibility?: ColyseusVisibilitySource,
): OutboundEventSink {
  return {
    publish(event) {
      emitColyseusOutbound(room, event, visibility);
    },
  };
}

/**
 * Message types that are *only* meaningful for a specific socket. Sending
 * them via the broadcast path (serverMessage) leaks owner state (inventory
 * contents, skill failure reasons, item-use results) to other players in
 * the same region. Every call site today routes these through the direct
 * sink — this guard catches future regressions before they hit the wire.
 */
const OWNER_ONLY_SERVER_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'InventoryUpdate',
  'EquipmentUpdate',
  'EquipFailed',
  'LearnSkillFailed',
  'SkillLearned',
  'SkillShortcutUpdated',
  'ClassSelected',
  'CastFail',
  'ItemUsed',
  'LootAcquired',
  'StarterProgressUpdate',
]);

function isOwnerOnlyServerMessage(message: ServerMessage): boolean {
  if (OWNER_ONLY_SERVER_MESSAGE_TYPES.has(message.type)) {
    return true;
  }
  // BatchUpdate must be inspected recursively: wrapping an owner-only
  // message inside a batch must not bypass the guard.
  if (message.type === 'BatchUpdate') {
    return message.updates.some(isOwnerOnlyServerMessage);
  }
  return false;
}

function emitColyseusOutbound(
  room: ColyseusBroadcastLike,
  event: OutboundEvent,
  visibility?: ColyseusVisibilitySource,
): void {
  switch (event.type) {
    case 'serverMessage':
      if (isOwnerOnlyServerMessage(event.message)) {
        // Owner-only messages must use `directServerMessage` so they only
        // reach the matching socket. Dropping here with a warning surfaces
        // the misuse immediately instead of leaking to nearby players.
        console.warn(
          `[colyseusRoomAdapter] dropped owner-only message broadcast: ${event.message.type}. ` +
          'Use directServerMessage instead.',
        );
        runtimeMetrics.increment('outbound.ownerOnlyBroadcastDropped');
        return;
      }
      if (emitScopedServerMessage(room, event.message, visibility)) {
        return;
      }
      room.broadcast(WORLD_BROADCAST_EVENTS.message, event.message);
      return;
    case 'directServerMessage':
      findClient(room, event.socketId)?.send(WORLD_BROADCAST_EVENTS.message, event.message);
      return;
    case 'playerUpdated':
      // PR BB — owner gets the un-sanitized update so private fields
      // (questState, characterInventory) actually reach the right
      // client. Everyone else gets the public-safe copy. The earlier
      // `sanitize for everyone` path stripped questState before it
      // could reach the owner, which is why quest progress (kill
      // counters etc.) only refreshed on reconnect — the full
      // gameState snapshot DID include questState, the per-tick
      // delta didn't.
      if (emitOwnerAwarePlayerUpdate(room, event.update, visibility)) {
        return;
      }
      room.broadcast(WORLD_BROADCAST_EVENTS.playerUpdated, sanitizePlayerUpdateForPublic(event.update));
      return;
    case 'enemyUpdated':
      if (emitScopedEntityEvent(
        room,
        WORLD_BROADCAST_EVENTS.enemyUpdated,
        event.update,
        event.update.id,
        visibility,
      )) {
        return;
      }
      room.broadcast(WORLD_BROADCAST_EVENTS.enemyUpdated, event.update);
      return;
  }
}

function makeColyseusClient(client: ColyseusClientLike): AuthoritativeRoomClient {
  return {
    emit(event: string, payload: unknown) {
      return client.send(event, payload);
    },
  };
}

function findClient(room: ColyseusBroadcastLike, sessionId: string): ColyseusClientLike | undefined {
  for (const client of room.clients ?? []) {
    if (client.sessionId === sessionId) {
      return client;
    }
  }

  return undefined;
}

function emitScopedServerMessage(
  room: ColyseusBroadcastLike,
  message: ServerMessage,
  visibility?: ColyseusVisibilitySource,
): boolean {
  const context = getVisibilityContext(visibility);
  if (!context) {
    return false;
  }

  for (const clientContext of createClientVisibilityContexts(room, context)) {
    const filteredMessage = filterServerMessageForClient(message, clientContext, context.state, context.regions);
    if (filteredMessage) {
      clientContext.client.send(WORLD_BROADCAST_EVENTS.message, filteredMessage);
    }
  }

  return true;
}

function emitScopedEntityEvent(
  room: ColyseusBroadcastLike,
  eventName: string,
  payload: unknown,
  entityId: string,
  visibility?: ColyseusVisibilitySource,
): boolean {
  const context = getVisibilityContext(visibility);
  if (!context) {
    return false;
  }

  for (const clientContext of createClientVisibilityContexts(room, context)) {
    if (isEntityVisibleToClient(context.state, context.regions, clientContext, entityId)) {
      clientContext.client.send(eventName, payload);
    }
  }

  return true;
}

/**
 * PR BB — owner-aware player update broadcast. The owning client
 * receives the full update (including private fields like
 * questState); everyone else receives the public-sanitised copy.
 * Returns true when the visibility context was available so the
 * caller can skip the fallback room.broadcast.
 */
function emitOwnerAwarePlayerUpdate(
  room: ColyseusBroadcastLike,
  update: PlayerUpdate,
  visibility?: ColyseusVisibilitySource,
): boolean {
  const context = getVisibilityContext(visibility);
  if (!context) return false;
  const ownerPlayer = context.state.players[update.id];
  const ownerSocketId = ownerPlayer?.socketId;
  const publicCopy = sanitizePlayerUpdateForPublic(update);
  for (const clientContext of createClientVisibilityContexts(room, context)) {
    const isOwner = ownerSocketId !== undefined && clientContext.client.sessionId === ownerSocketId;
    if (isOwner) {
      clientContext.client.send(WORLD_BROADCAST_EVENTS.playerUpdated, update);
      continue;
    }
    if (isEntityVisibleToClient(context.state, context.regions, clientContext, update.id)) {
      clientContext.client.send(WORLD_BROADCAST_EVENTS.playerUpdated, publicCopy);
    }
  }
  return true;
}

function filterServerMessageForClient(
  message: ServerMessage,
  clientContext: ClientVisibilityContext,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): ServerMessage | null {
  if (message.type !== 'BatchUpdate') {
    return isServerMessageVisibleToClient(message, clientContext, state, regions) ? message : null;
  }

  const updates: ServerMessage[] = [];
  for (const update of message.updates) {
    const filteredUpdate = filterServerMessageForClient(update, clientContext, state, regions);
    if (filteredUpdate) {
      updates.push(filteredUpdate);
    }
  }

  if (updates.length === 0) {
    return null;
  }

  runtimeMetrics.increment('snapshot.scopedClientBatches');
  runtimeMetrics.increment('snapshot.scopedClientUpdates', updates.length);
  return { ...message, updates };
}

function isServerMessageVisibleToClient(
  message: ServerMessage,
  clientContext: ClientVisibilityContext,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): boolean {
  const regionId = getServerMessageRegionId(message, state, regions);
  return isRegionVisibleToClient(clientContext, regionId);
}

function getServerMessageRegionId(
  message: ServerMessage,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): string | undefined {
  switch (message.type) {
    case 'PosSnap':
      return getEntityRegionId(state, regions, message.id) ?? getPositionRegionId(regions, message.pos);
    case 'InstantHit':
      return getFirstEntityRegionId(state, regions, message.hitIds) ?? getPositionRegionId(regions, message.targetPos);
    case 'CastSnapshot':
      return getEntityRegionId(state, regions, message.data.casterId) ?? getPositionRegionId(regions, message.data.pos);
    case 'EffectSnapshot':
      return getEffectSnapshotRegionId(message, state, regions);
    case 'CombatLog':
      return getEntityRegionId(state, regions, message.casterId)
        ?? getFirstEntityRegionId(state, regions, message.targets);
    case 'EnemyAttack':
      return getEntityRegionId(state, regions, message.enemyId);
    case 'LootSpawn':
      return getEntityRegionId(state, regions, message.enemyId) ?? getPositionRegionId(regions, message.position);
    case 'LootPickup':
      return getEntityRegionId(state, regions, message.playerId);
    case 'InventoryUpdate':
      return message.playerId ? getEntityRegionId(state, regions, message.playerId) : undefined;
    default:
      return undefined;
  }
}

function getEffectSnapshotRegionId(
  message: Extract<ServerMessage, { type: 'EffectSnapshot' }>,
  state: GameState,
  regions: readonly ServerWorldRegion[],
): string | undefined {
  if ('targetId' in message) {
    return getEntityRegionId(state, regions, message.targetId);
  }

  return getEntityRegionId(state, regions, message.id) ?? getEntityRegionId(state, regions, message.src);
}

function getFirstEntityRegionId(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  entityIds: readonly string[],
): string | undefined {
  for (const entityId of entityIds) {
    const regionId = getEntityRegionId(state, regions, entityId);
    if (regionId) {
      return regionId;
    }
  }

  return undefined;
}

function getVisibilityContext(visibility?: ColyseusVisibilitySource): VisibilityContext | null {
  const state = visibility?.getGameState();
  const regions = visibility?.getRegions();
  if (!state || !regions) {
    return null;
  }

  return {
    state,
    regions,
    playerIdsBySocket: createSocketPlayerLookup(state),
  };
}

function createClientVisibilityContexts(
  room: ColyseusBroadcastLike,
  context: VisibilityContext,
): ClientVisibilityContext[] {
  const contexts: ClientVisibilityContext[] = [];
  for (const client of room.clients ?? []) {
    const playerId = context.playerIdsBySocket.get(client.sessionId);
    contexts.push({
      client,
      socketId: client.sessionId,
      visibleRegionIds: getPlayerStreamRegionIdsForPlayer(context.state, context.regions, playerId),
    });
  }
  return contexts;
}

function isEntityVisibleToClient(
  state: GameState,
  regions: readonly ServerWorldRegion[],
  clientContext: ClientVisibilityContext,
  entityId: string,
): boolean {
  const player = state.players[entityId];
  if (player?.socketId === clientContext.socketId) {
    return true;
  }

  const regionId = getEntityRegionId(state, regions, entityId);
  return isRegionVisibleToClient(clientContext, regionId);
}

function isRegionVisibleToClient(
  clientContext: ClientVisibilityContext,
  regionId: string | undefined,
): boolean {
  return !regionId || clientContext.visibleRegionIds.has(regionId);
}
