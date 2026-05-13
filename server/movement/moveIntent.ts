import type { MoveIntent } from '../../packages/protocol/messages.js';
import type { GameState } from '../gameState.js';
import { calculateDir, distance, getPlayerSpeed, isValidPosition } from './worldMovement.js';

export type MoveIntentResult =
  | { ok: true; kind: 'move' | 'stop'; playerId: string; speed: number }
  | { ok: false; reason: 'playerNotFound' | 'socketMismatch' | 'invalidTarget'; playerId: string };

export function applyMoveIntent(
  state: GameState,
  socketId: string,
  msg: MoveIntent,
  now: number = Date.now(),
): MoveIntentResult {
  const playerId = msg.id;
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

  const currentPos = { x: player.position.x, z: player.position.z };
  const speed = getPlayerSpeed(player);

  if (distance(currentPos, msg.targetPos) < 0.05) {
    player.movement = {
      isMoving: false,
      lastUpdateTime: now,
      speed,
    };
    player.velocity = { x: 0, z: 0 };
    markPlayerDirty(player);
    return { ok: true, kind: 'stop', playerId, speed };
  }

  const dir = calculateDir(currentPos, msg.targetPos);
  player.movement = {
    isMoving: true,
    targetPos: msg.targetPos,
    lastUpdateTime: now,
    speed,
  };
  player.velocity = {
    x: dir.x * speed,
    z: dir.z * speed,
  };
  player.rotation.y = Math.atan2(dir.x, dir.z);
  player.lastUpdateTime = now;
  markPlayerDirty(player);

  return { ok: true, kind: 'move', playerId, speed };
}

function markPlayerDirty(player: GameState['players'][string]): void {
  (player as typeof player & { dirtySnap?: boolean }).dirtySnap = true;
}
