import type { ClientMessage, ServerMessage } from '../../packages/protocol/messages.js';
import { SESSION_EVENTS } from '../../packages/protocol/sessionEvents.js';
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
  'SelectRace',
  'RespawnRequest',
  'LootPickup',
  'UseItem',
  'CraftItem',
  'RequestInventory',
  'EquipItem',
  'UnequipItem',
  'DevTeleport',
  'ChatRequest',
  'SelectSpecialization',
  'UpgradeSkill',
  'TalkNpc',
  'AcceptQuest',
  'CancelQuest',
  'AdvanceQuest',
  'ClaimQuestReward',
  'GmCommand',
] as const satisfies ReadonlyArray<ClientMessage['type']>;

export const MIN_CLIENT_PROTOCOL_VERSION = 2;
export const SOCKET_SESSION_EVENTS = SESSION_EVENTS;

export type WorldRoomJoinOptions = {
  playerName?: string;
  clientProtocolVersion?: number;
  /**
   * Initial race / class chosen at the character-creation step in
   * the lobby. Server uses these only when creating a *new* player
   * row; an existing player keeps the persisted identity. Avoids
   * post-join SelectRace / SelectClass round-trips for first-time
   * characters.
   */
  initialRace?: string;
  initialClass?: string;
  /**
   * Bearer session token issued by /api/auth/{login,register}.
   * Required post-PR-I; the world room verifies it and looks up
   * the chosen character by (accountId, playerName).
   */
  sessionToken?: string;
};

export function parseWorldRoomJoinOptions(options: unknown): WorldRoomJoinOptions {
  if (!options || typeof options !== 'object') {
    return {};
  }

  const value = options as Record<string, unknown>;
  return {
    playerName: typeof value.playerName === 'string' ? value.playerName : undefined,
    clientProtocolVersion: typeof value.clientProtocolVersion === 'number'
      ? value.clientProtocolVersion
      : undefined,
    initialRace: typeof value.initialRace === 'string' ? value.initialRace : undefined,
    initialClass: typeof value.initialClass === 'string' ? value.initialClass : undefined,
    sessionToken: typeof value.sessionToken === 'string' ? value.sessionToken : undefined,
  };
}

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
    options?: { initialRace?: string; initialClass?: string; accountId?: string },
  ): Promise<{ playerId: string }>;
  leaveClient(socketId: string): Promise<string | undefined>;
  dispatchCommand(
    socketId: string,
    command: AuthoritativeRoomCommand,
    client?: AuthoritativeRoomClient,
  ): void;
  getStateSnapshot(): GameState;
}
