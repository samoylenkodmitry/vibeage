import type { PredictionKeyframe, VecXZ } from '../../packages/protocol/messages.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import { WORLD_SETTINGS } from '../../packages/content/world.js';
import type { GameState } from '../gameState.js';
import { gridCellChanged, type SpatialHashGrid } from '../spatial/SpatialHashGrid.js';

const MAX_HISTORY_AGE_MS = 500;
const DEFAULT_PLAYER_SPEED = 20;
const MAX_PLAYER_SPEED = 40;

type PredictionKeyframeInput = {
  entity: PlayerState | Enemy;
  currentPos: VecXZ;
  currentVel: VecXZ;
  currentRotY: number;
  timestamp: number;
  offsetsMs: number[];
  state: GameState;
};

export function distance(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function calculateDir(from: VecXZ, to: VecXZ): { x: number; y: number; z: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: dx / dist,
    y: 0,
    z: dz / dist,
  };
}

export function predictPosition(
  entity: {
    position: { x: number; y: number; z: number };
    movement?: { targetPos?: VecXZ | null; speed?: number; lastUpdateTime: number };
  },
  timestamp: number,
): VecXZ {
  const dest = entity.movement?.targetPos;
  if (!dest) {
    return { x: entity.position.x, z: entity.position.z };
  }

  const speed = entity.movement.speed ?? DEFAULT_PLAYER_SPEED;
  const elapsedSec = (timestamp - entity.movement.lastUpdateTime) / 1000;
  const currentPos = { x: entity.position.x, z: entity.position.z };
  const dir = calculateDir(currentPos, dest);
  const distanceCovered = speed * elapsedSec;
  const totalDistance = distance(currentPos, dest);

  if (distanceCovered >= totalDistance) {
    return dest;
  }

  return {
    x: currentPos.x + dir.x * distanceCovered,
    z: currentPos.z + dir.z * distanceCovered,
  };
}

export function advanceAll(
  state: GameState,
  spatial: SpatialHashGrid,
  deltaTimeMs: number,
  now: number = Date.now(),
): void {
  for (const player of Object.values(state.players)) {
    if (player.movement?.isMoving && player.movement?.targetPos) {
      advancePlayerPosition(player, spatial, deltaTimeMs, now);
    }
    pruneExpiredStatusEffects(player, now);
  }

  for (const enemy of Object.values(state.enemies)) {
    if (!enemy.isAlive) {
      continue;
    }

    advanceEnemyPosition(enemy, spatial, deltaTimeMs, now);
    pruneExpiredStatusEffects(enemy, now);
  }
}

export function getPlayerSpeed(player: PlayerState): number {
  let speed = DEFAULT_PLAYER_SPEED;

  if (player.stats) {
    if ('movement' in player.stats) {
      speed += player.stats.movement as number;
    } else if (player.stats.dmgMult) {
      speed += player.stats.dmgMult * 2;
    }
  }

  for (const effect of player.statusEffects) {
    if (effect.type === 'speed_boost') {
      speed *= 1.3;
    } else if (effect.type === 'slow') {
      speed *= 0.7;
    }
  }

  return Math.min(speed, MAX_PLAYER_SPEED);
}

export function isValidPosition(pos: VecXZ): boolean {
  return Number.isFinite(pos.x)
    && Number.isFinite(pos.z)
    && Math.abs(pos.x) <= WORLD_SETTINGS.playableRadius
    && Math.abs(pos.z) <= WORLD_SETTINGS.playableRadius;
}

export function predictEntityStateAtOffset(
  entity: PlayerState | Enemy,
  basePos: VecXZ,
  baseVel: VecXZ,
  baseRotY: number,
  deltaTimeOffsetMs: number,
  gameState: GameState,
): { pos: VecXZ; rotY: number } {
  try {
    const predicted = predictLinearState(entity, basePos, baseVel, baseRotY, deltaTimeOffsetMs);
    return refineEnemyFacing(entity, predicted, gameState);
  } catch (error) {
    console.error('Error in position prediction:', error);
    return { pos: basePos, rotY: baseRotY };
  }
}

export function createPredictionKeyframes({
  entity,
  currentPos,
  currentVel,
  currentRotY,
  timestamp,
  offsetsMs,
  state,
}: PredictionKeyframeInput): PredictionKeyframe[] {
  const predictions: PredictionKeyframe[] = [];

  for (const offsetMs of offsetsMs) {
    const predictedState = predictEntityStateAtOffset(entity, currentPos, currentVel, currentRotY, offsetMs, state);
    const reachedTarget = maybePushReachedTargetPrediction(entity, currentPos, predictedState.rotY, timestamp, offsetMs, predictions);

    if (reachedTarget) {
      break;
    }

    predictions.push({
      pos: predictedState.pos,
      rotY: predictedState.rotY,
      ts: timestamp + offsetMs,
    });
  }

  return predictions;
}

function advancePlayerPosition(
  player: PlayerState,
  spatial: SpatialHashGrid,
  deltaTimeMs: number,
  now: number,
): void {
  const dest = player.movement?.targetPos;
  if (!dest) {
    return;
  }

  const currentPos = { x: player.position.x, z: player.position.z };
  const speed = player.movement.speed;
  const dir = calculateDir(currentPos, dest);
  player.velocity = { x: dir.x * speed, z: dir.z * speed };
  player.dirtySnap = true;

  const step = velocityStep(player.velocity, deltaTimeMs);
  const oldPosForGrid = { ...currentPos };
  const distToTarget = distance(currentPos, dest);

  if (step.distance >= distToTarget || distToTarget < 0.05) {
    stopPlayerAtDestination(player, spatial, oldPosForGrid, dest, now);
    return;
  }

  player.position.x += step.x;
  player.position.z += step.z;
  moveSpatialIfNeeded(spatial, player.id, oldPosForGrid, player.position);
  updateRotationFromVelocity(player);
  player.movement.lastUpdateTime = now;
  updatePositionHistory(player, now);
}

function advanceEnemyPosition(
  enemy: Enemy,
  spatial: SpatialHashGrid,
  deltaTimeMs: number,
  now: number,
): void {
  if (!enemy.velocity || (enemy.velocity.x === 0 && enemy.velocity.z === 0)) {
    return;
  }

  const oldPosForGrid = { x: enemy.position.x, z: enemy.position.z };
  const step = velocityStep(enemy.velocity, deltaTimeMs);
  enemy.position.x += step.x;
  enemy.position.z += step.z;

  moveSpatialIfNeeded(spatial, enemy.id, oldPosForGrid, enemy.position);
  updateRotationFromVelocity(enemy);
  updatePositionHistory(enemy, now);
  enemy.lastUpdateTime = now;
}

function stopPlayerAtDestination(
  player: PlayerState,
  spatial: SpatialHashGrid,
  oldPosForGrid: VecXZ,
  dest: VecXZ,
  now: number,
): void {
  player.position.x = dest.x;
  player.position.z = dest.z;
  moveSpatialIfNeeded(spatial, player.id, oldPosForGrid, player.position);

  player.movement.targetPos = null;
  player.movement.isMoving = false;
  player.velocity = { x: 0, z: 0 };
  player.movement.lastUpdateTime = now;
  player.dirtySnap = true;
  updatePositionHistory(player, now);
}

function velocityStep(velocity: VecXZ, deltaTimeMs: number): VecXZ & { distance: number } {
  const deltaTimeSec = deltaTimeMs / 1000;
  const x = velocity.x * deltaTimeSec;
  const z = velocity.z * deltaTimeSec;
  return { x, z, distance: Math.sqrt(x * x + z * z) };
}

function moveSpatialIfNeeded(
  spatial: SpatialHashGrid,
  id: string,
  oldPos: VecXZ,
  newPos: { x: number; z: number },
): void {
  if (gridCellChanged(oldPos, newPos)) {
    spatial.move(id, oldPos, newPos);
  }
}

function updateRotationFromVelocity(entity: PlayerState | Enemy): void {
  if (entity.velocity && (entity.velocity.x !== 0 || entity.velocity.z !== 0)) {
    entity.rotation.y = Math.atan2(entity.velocity.x, entity.velocity.z);
  }
}

function updatePositionHistory(entity: PlayerState | Enemy, timestamp: number): void {
  if (!entity.posHistory) {
    entity.posHistory = [];
  }

  entity.posHistory.push({
    ts: timestamp,
    x: entity.position.x,
    z: entity.position.z,
  });

  while (entity.posHistory.length > 0 && entity.posHistory[0].ts < timestamp - MAX_HISTORY_AGE_MS) {
    entity.posHistory.shift();
  }
}

function pruneExpiredStatusEffects(entity: PlayerState | Enemy, now: number): void {
  if (entity.statusEffects.length === 0) {
    return;
  }
  // Cheap pre-check: if nothing's expired, skip the filter allocation.
  // `?? 0` keeps the arithmetic safe if a malformed effect slips past
  // schema validation — NaN comparisons would all be false, leaking the
  // effect forever; falling back to 0 forces immediate pruning instead.
  const hasExpired = entity.statusEffects.some(
    (effect) => (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0) <= now,
  );
  if (!hasExpired) {
    return;
  }
  entity.statusEffects = entity.statusEffects.filter(
    (effect) => (effect.startTimeTs ?? 0) + (effect.durationMs ?? 0) > now,
  );
}

function predictLinearState(
  entity: PlayerState | Enemy,
  basePos: VecXZ,
  baseVel: VecXZ,
  baseRotY: number,
  deltaTimeOffsetMs: number,
): { pos: VecXZ; rotY: number } {
  if ('movement' in entity && entity.movement?.targetPos && entity.movement.speed) {
    return predictPlayerMovement(entity, basePos, baseRotY, deltaTimeOffsetMs);
  }

  if (baseVel && (baseVel.x !== 0 || baseVel.z !== 0)) {
    return {
      pos: {
        x: basePos.x + baseVel.x * (deltaTimeOffsetMs / 1000),
        z: basePos.z + baseVel.z * (deltaTimeOffsetMs / 1000),
      },
      rotY: Math.atan2(baseVel.x, baseVel.z),
    };
  }

  return { pos: { ...basePos }, rotY: baseRotY };
}

function predictPlayerMovement(
  player: PlayerState,
  basePos: VecXZ,
  baseRotY: number,
  deltaTimeOffsetMs: number,
): { pos: VecXZ; rotY: number } {
  const targetPos = player.movement!.targetPos!;
  const speed = player.movement!.speed!;
  const dirToTarget = calculateDir(basePos, targetPos);
  const step = velocityStep({ x: dirToTarget.x * speed, z: dirToTarget.z * speed }, deltaTimeOffsetMs);
  const distToTarget = distance(basePos, targetPos);
  const rotY = dirToTarget.x !== 0 || dirToTarget.z !== 0 ? Math.atan2(dirToTarget.x, dirToTarget.z) : baseRotY;

  if (step.distance >= distToTarget || distToTarget < 0.05) {
    return { pos: { ...targetPos }, rotY };
  }

  return {
    pos: { x: basePos.x + step.x, z: basePos.z + step.z },
    rotY,
  };
}

function refineEnemyFacing(
  entity: PlayerState | Enemy,
  predicted: { pos: VecXZ; rotY: number },
  gameState: GameState,
): { pos: VecXZ; rotY: number } {
  if (!('aiState' in entity) || !entity.targetId || !gameState.players[entity.targetId]) {
    return predicted;
  }

  const targetPlayer = gameState.players[entity.targetId];
  const dirToTargetPlayer = calculateDir(predicted.pos, targetPlayer.position);
  if (dirToTargetPlayer.x === 0 && dirToTargetPlayer.z === 0) {
    return predicted;
  }

  return {
    pos: predicted.pos,
    rotY: Math.atan2(dirToTargetPlayer.x, dirToTargetPlayer.z),
  };
}

function maybePushReachedTargetPrediction(
  entity: PlayerState | Enemy,
  currentPos: VecXZ,
  rotY: number,
  timestamp: number,
  offsetMs: number,
  predictions: PredictionKeyframe[],
): boolean {
  if (!('movement' in entity) || !entity.movement?.targetPos) {
    return false;
  }

  const distFromBaseToTarget = distance(currentPos, entity.movement.targetPos);
  const distTravelledInOffset = (entity.movement.speed || 0) * (offsetMs / 1000);
  if (distTravelledInOffset < distFromBaseToTarget) {
    return false;
  }

  predictions.push({
    pos: entity.movement.targetPos,
    rotY,
    ts: timestamp + offsetMs,
  });
  return true;
}
