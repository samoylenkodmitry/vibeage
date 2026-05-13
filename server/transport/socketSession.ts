import type { Server, Socket } from 'socket.io';
import { describeProtocolError, safeParseClientMessage, type ClientMessage } from '../../packages/protocol/messages.js';
import { sendCastSnapshots } from '../combat/skillSystem.js';
import type { GameState } from '../gameState.js';
import { getClientIp } from '../security.js';
import type { RateLimiter } from '../utils/rateLimiter.js';
import { emitInventoryUpdate } from '../world/clientMessageRouter.js';
import { makeSocketMessageSink } from './outboundEvents.js';
import {
  legacyCastSkillRequestToClientMessage,
  legacyMoveStartToClientMessage,
  legacyMoveStopToClientMessage,
} from './legacyClientMessages.js';
import { SOCKET_SESSION_EVENTS } from './roomBoundary.js';

type WorldApi = {
  handleMessage(socket: Socket, msg: ClientMessage): void;
  getGameState(): GameState;
  addPlayer(socketId: string, name: string): Promise<GameState['players'][string]>;
  removePlayerBySocketId(socketId: string): Promise<string | undefined>;
};

type JoinGameData = {
  playerName: string;
  clientProtocolVersion?: number;
};

export function registerSocketSession(
  io: Server,
  world: WorldApi,
  joinGameLimiter: RateLimiter,
): void {
  io.on('connection', (socket) => {
    bindSocketSession(io, world, joinGameLimiter, socket);
  });
}

function bindSocketSession(
  io: Server,
  world: WorldApi,
  joinGameLimiter: RateLimiter,
  socket: Socket,
): void {
  console.log('Client connected:', socket.id);
  const clientIp = getClientIp(socket.handshake.headers, socket.handshake.address);

  socket.on(SOCKET_SESSION_EVENTS.joinGame, (data: JoinGameData) => {
    void handleJoinGame(io, world, joinGameLimiter, socket, clientIp, data);
  });
  socket.on(SOCKET_SESSION_EVENTS.requestGameState, () => sendGameState(socket, world));
  socket.on(SOCKET_SESSION_EVENTS.message, (message) => forwardClientMessage(socket, world, message, 'msg'));
  socket.on(SOCKET_SESSION_EVENTS.moveStart, (message) => {
    console.log('Legacy moveStart received - should use msg type instead');
    forwardClientMessage(socket, world, legacyMoveStartToClientMessage(message), 'moveStart');
  });
  socket.on(SOCKET_SESSION_EVENTS.moveStop, (message) => {
    console.log('Legacy moveStop received - should use MoveIntent instead');
    forwardClientMessage(socket, world, legacyMoveStopToClientMessage(message), 'moveStop');
  });
  socket.on(SOCKET_SESSION_EVENTS.castSkillRequest, (data) => {
    console.log('Legacy castSkillRequest received - should use CastReq instead');
    forwardClientMessage(socket, world, legacyCastSkillRequestToClientMessage(data, findPlayerIdForSocket(world, socket.id)), 'castSkillRequest');
  });
  socket.on(SOCKET_SESSION_EVENTS.disconnect, () => {
    void handleDisconnect(io, world, socket);
  });
}

function forwardClientMessage(socket: Socket, world: WorldApi, message: unknown, source: string): void {
  const parsed = safeParseClientMessage(message);
  if (!parsed.success) {
    console.warn(`Rejected invalid client message from ${socket.id} via ${source}: ${describeProtocolError(parsed.error)}`);
    return;
  }

  world.handleMessage(socket, parsed.data);
}

async function handleJoinGame(
  io: Server,
  world: WorldApi,
  joinGameLimiter: RateLimiter,
  socket: Socket,
  clientIp: string,
  data: JoinGameData,
): Promise<void> {
  if (!joinGameLimiter.isAllowed(clientIp)) {
    console.warn(`Rate limit exceeded for ${clientIp}. Rejecting joinGame request.`);
    socket.emit(SOCKET_SESSION_EVENTS.connectionRejected, { reason: 'rateLimited', message: 'Too many join attempts. Please try again later.' });
    return;
  }

  const clientVersion = data.clientProtocolVersion || 1;
  if (clientVersion < 2) {
    console.warn(`Client ${socket.id} using outdated protocol version ${clientVersion}. Rejecting connection.`);
    socket.emit(SOCKET_SESSION_EVENTS.connectionRejected, { reason: 'outdatedProtocol', message: 'This server requires protocol v2 or higher.' });
    socket.disconnect(true);
    return;
  }

  console.log(`Player joining: ${data.playerName} with protocol version ${clientVersion}`);

  try {
    const player = await world.addPlayer(socket.id, data.playerName);
    socket.emit(SOCKET_SESSION_EVENTS.joinGame, { playerId: player.id });
    socket.emit(SOCKET_SESSION_EVENTS.gameState, world.getGameState());
    const direct = makeSocketMessageSink(socket);
    emitInventoryUpdate(direct, player);
    sendCastSnapshots(world.getGameState().activeCasts, direct);
    socket.broadcast.emit(SOCKET_SESSION_EVENTS.playerJoined, player);
  } catch (error) {
    console.error('Error during player join:', error);
    socket.emit(SOCKET_SESSION_EVENTS.connectionRejected, { reason: 'serverError', message: 'Server error during join process. Please try again.' });
  }
}

function sendGameState(socket: Socket, world: WorldApi): void {
  const gameState = world.getGameState();
  console.log('Client requested game state. Enemy count:', Object.keys(gameState.enemies).length);
  socket.emit(SOCKET_SESSION_EVENTS.gameState, gameState);

  const playerId = findPlayerIdForSocket(world, socket.id);
  if (playerId) {
    emitInventoryUpdate(makeSocketMessageSink(socket), gameState.players[playerId]);
  }
}

async function handleDisconnect(io: Server, world: WorldApi, socket: Socket): Promise<void> {
  console.log('Client disconnected:', socket.id);

  try {
    const playerId = await world.removePlayerBySocketId(socket.id);
    if (playerId) {
      io.emit(SOCKET_SESSION_EVENTS.playerLeft, playerId);
    }
  } catch (error) {
    console.error('Error during player disconnect:', error);
  }
}

function findPlayerIdForSocket(world: WorldApi, socketId: string): string | undefined {
  const players = world.getGameState().players;
  return Object.keys(players).find((id) => players[id].socketId === socketId);
}
