import type { GameState } from '../gameState.js';
import type { PlayerState } from '../../packages/sim/entities.js';
import type { PlayerUpdate } from './outboundEvents.js';

export const PRIVATE_PLAYER_STATE_FIELDS = [
  'socketId',
  'starterProgress',
  'inventory',
  'maxInventorySlots',
] as const;
export const CLIENT_GAME_STATE_FIELDS = [
  'players',
  'enemies',
  'groundLoot',
  'zones',
] as const satisfies ReadonlyArray<keyof GameState>;

type PrivatePlayerStateField = typeof PRIVATE_PLAYER_STATE_FIELDS[number];
export type PublicPlayerState = Omit<PlayerState, PrivatePlayerStateField>;
export type ClientPlayerState = PlayerState | PublicPlayerState;
export type ClientGameStateSnapshot = Pick<GameState, 'enemies' | 'groundLoot' | 'zones'> & {
  players: Record<string, ClientPlayerState>;
};

export function makeClientGameStateSnapshot(state: GameState, socketId: string): ClientGameStateSnapshot {
  const players = Object.fromEntries(
    Object.entries(state.players).map(([playerId, player]) => [
      playerId,
      player.socketId === socketId ? player : sanitizePlayerForPublic(player),
    ]),
  ) as ClientGameStateSnapshot['players'];

  return {
    players,
    enemies: getGloballyRelevantEnemies(state),
    groundLoot: state.groundLoot,
    zones: state.zones,
  };
}

function getGloballyRelevantEnemies(state: GameState): GameState['enemies'] {
  const activeZoneIds = new Set(state.zones.activeZoneIds);
  if (activeZoneIds.size === 0) {
    return state.enemies;
  }

  return Object.fromEntries(
    Object.entries(state.enemies).filter(([enemyId]) => activeZoneIds.has(state.zones.enemyZoneIds[enemyId])),
  );
}

export function sanitizePlayerForPublic(player: PlayerState): PublicPlayerState {
  const publicPlayer = { ...player };
  deletePrivatePlayerState(publicPlayer);
  return publicPlayer as PublicPlayerState;
}

export function sanitizePlayerUpdateForPublic(update: PlayerUpdate): PlayerUpdate {
  const publicUpdate = { ...update };
  deletePrivatePlayerState(publicUpdate);
  return publicUpdate;
}

function deletePrivatePlayerState(player: Partial<PlayerState>): void {
  for (const field of PRIVATE_PLAYER_STATE_FIELDS) {
    delete player[field];
  }
}
