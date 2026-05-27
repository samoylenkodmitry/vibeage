import type { DevTeleport } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import { isValidPosition } from './worldMovement.js';

export type DevTeleportResult =
  | { ok: true; playerId: string }
  | {
      ok: false;
      reason: 'disabled' | 'playerNotFound' | 'socketMismatch' | 'invalidTarget';
      playerId: string;
    };

export function isDevCommandsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VIBEAGE_ENABLE_DEV_COMMANDS === '1';
}

export function applyDevTeleport(
  state: GameState,
  socketId: string,
  msg: DevTeleport,
  now: number,
  env: NodeJS.ProcessEnv = process.env,
): DevTeleportResult {
  const playerId = msg.id;

  if (!isDevCommandsEnabled(env)) {
    return { ok: false, reason: 'disabled', playerId };
  }

  const player = state.players[playerId];

  if (!player) {
    return { ok: false, reason: 'playerNotFound', playerId };
  }

  if (player.socketId !== socketId) {
    return { ok: false, reason: 'socketMismatch', playerId };
  }

  if (!isValidPosition(msg.targetPos)) {
    return { ok: false, reason: 'invalidTarget', playerId };
  }

  player.position.x = msg.targetPos.x;
  player.position.z = msg.targetPos.z;
  player.velocity = { x: 0, z: 0 };
  player.movement = {
    isMoving: false,
    lastUpdateTime: now,
    speed: player.movement?.speed ?? 0,
  };
  player.lastUpdateTime = now;
  player.dirtySnap = true;

  return { ok: true, playerId };
}
