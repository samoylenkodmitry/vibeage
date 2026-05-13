import type { ClientMessage } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import type {
  AuthoritativeRoomClient,
  AuthoritativeRoomCommand,
  AuthoritativeRoomPort,
  AuthoritativeRoomSocket,
} from './roomBoundary.js';

export type SocketBackedWorldApi = {
  handleMessage(socket: AuthoritativeRoomSocket, msg: ClientMessage): void;
  getGameState(): GameState;
  addPlayer(socketId: string, name: string): Promise<GameState['players'][string]>;
  removePlayerBySocketId(socketId: string): Promise<string | undefined>;
};

export class SocketBackedAuthoritativeRoom implements AuthoritativeRoomPort {
  private readonly clients = new Map<string, AuthoritativeRoomClient>();

  constructor(private readonly world: SocketBackedWorldApi) {}

  async joinClient(
    socketId: string,
    playerName: string,
    client?: AuthoritativeRoomClient,
  ): Promise<{ playerId: string }> {
    this.setClient(socketId, client);
    const player = await this.world.addPlayer(socketId, playerName);
    return { playerId: player.id };
  }

  async leaveClient(socketId: string): Promise<string | undefined> {
    this.clients.delete(socketId);
    return this.world.removePlayerBySocketId(socketId);
  }

  dispatchCommand(
    socketId: string,
    command: AuthoritativeRoomCommand,
    client?: AuthoritativeRoomClient,
  ): void {
    this.setClient(socketId, client);
    this.world.handleMessage(
      createRoomCommandSocket(socketId, this.clients.get(socketId)),
      command,
    );
  }

  getStateSnapshot(): GameState {
    return this.world.getGameState();
  }

  private setClient(socketId: string, client?: AuthoritativeRoomClient): void {
    if (client) {
      this.clients.set(socketId, client);
    }
  }
}

export function createSocketBackedAuthoritativeRoom(
  world: SocketBackedWorldApi,
): AuthoritativeRoomPort {
  return new SocketBackedAuthoritativeRoom(world);
}

function createRoomCommandSocket(
  socketId: string,
  client?: AuthoritativeRoomClient,
): AuthoritativeRoomSocket {
  return {
    id: socketId,
    emit(event: string, payload: unknown) {
      return client?.emit(event, payload) ?? false;
    },
  };
}
