import type { ClientMessage, ServerMessage } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';

export const AUTHORITATIVE_ROOM_STATE_KEYS = [
  'players',
  'enemies',
  'activeCasts',
  'effectsByTarget',
  'projectiles',
  'groundLoot',
  'zones',
] as const satisfies ReadonlyArray<keyof GameState>;

export const WORLD_CLIENT_COMMAND_TYPES = [
  'MoveIntent',
  'CastReq',
  'LearnSkill',
  'SetSkillShortcut',
  'SelectClass',
  'RespawnRequest',
  'LootPickup',
  'UseItem',
  'RequestInventory',
] as const satisfies ReadonlyArray<ClientMessage['type']>;

export const SOCKET_SESSION_EVENTS = {
  joinGame: 'joinGame',
  requestGameState: 'requestGameState',
  message: 'msg',
  moveStart: 'moveStart',
  moveStop: 'moveStop',
  castSkillRequest: 'castSkillRequest',
  disconnect: 'disconnect',
  connectionRejected: 'connectionRejected',
  playerJoined: 'playerJoined',
  playerLeft: 'playerLeft',
  gameState: 'gameState',
} as const;

export type AuthoritativeRoomCommand = ClientMessage;
export type AuthoritativeRoomEvent = ServerMessage;

export interface AuthoritativeRoomClient {
  emit(event: string, payload: unknown): unknown;
}

export interface AuthoritativeRoomSocket extends AuthoritativeRoomClient {
  id: string;
}

export interface AuthoritativeRoomPort {
  joinClient(
    socketId: string,
    playerName: string,
    client?: AuthoritativeRoomClient,
  ): Promise<{ playerId: string }>;
  leaveClient(socketId: string): Promise<string | undefined>;
  dispatchCommand(
    socketId: string,
    command: AuthoritativeRoomCommand,
    client?: AuthoritativeRoomClient,
  ): void;
  getStateSnapshot(): GameState;
}
