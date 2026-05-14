import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../shared/types.js';
import type { PlayerUpdate } from './outboundEvents.js';

export function makeClientGameStateSnapshot(state: GameState, socketId: string): GameState {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([playerId, player]) => [
      playerId,
      player.socketId === socketId ? player : sanitizePlayerForPublic(player),
    ]),
  ) as GameState['players'];

  return { ...state, players };
}

export function sanitizePlayerForPublic<Player extends PlayerState>(player: Player): Omit<Player, 'starterProgress'> {
  const publicPlayer = { ...player };
  delete publicPlayer.starterProgress;
  return publicPlayer;
}

export function sanitizePlayerUpdateForPublic(update: PlayerUpdate): PlayerUpdate {
  const publicUpdate = { ...update };
  delete publicUpdate.starterProgress;
  return publicUpdate;
}
