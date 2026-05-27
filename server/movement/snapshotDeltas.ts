import type { PosSnap, PredictionKeyframe, VecXZ } from '../../packages/protocol/messages.js';
import { CM_PER_UNIT } from '../../packages/protocol/netConstants.js';
import type { Enemy, PlayerState } from '../../packages/sim/entities.js';
import type { GameState } from '../gameState.js';
import { debug, LOG_CATEGORIES } from '../logger.js';
import { createActiveRegionIdSet, isEnemyInActiveRegion } from '../world/regions.js';
import {
  createPredictionKeyframes,
  predictPosition,
} from './worldMovement.js';

const TICK_MS = 1000 / 30;
const PREDICTION_TICK_OFFSETS = [TICK_MS, TICK_MS * 2];
const lastSentPos: Record<string, VecXZ> = {};

type SnapInput = {
  messages: PosSnap[];
  id: string;
  pos: VecXZ;
  vel: VecXZ;
  timestamp: number;
  predictions: PredictionKeyframe[];
};

export function collectDeltas(
  state: GameState,
  timestamp: number,
  playersToForceInclude: Set<string>,
): PosSnap[] {
  const messages: PosSnap[] = [];
  collectPlayerDeltas(state, timestamp, playersToForceInclude, messages);
  collectEnemyDeltas(state, timestamp, messages);
  return messages;
}

export function forgetPositionDelta(id: string): void {
  delete lastSentPos[id];
}

function collectPlayerDeltas(
  state: GameState,
  timestamp: number,
  playersToForceInclude: Set<string>,
  messages: PosSnap[],
): void {
  for (const [playerId, player] of Object.entries(state.players)) {
    if (!player.isAlive) {
      continue;
    }

    const pos = predictPosition(player, timestamp);
    const vel = player.velocity || { x: 0, z: 0 };

    // Perf: only build prediction keyframes when we're actually
    // going to send this snap. Pre-fix predictions were allocated
    // for every player every tick, then discarded for any player
    // that hadn't moved (the common case once a group is standing
    // around). The allocation scales with idle entity count.
    if (playersToForceInclude.has(playerId) || shouldSendSnap(playerId, pos, player)) {
      const predictions = playerPredictions(state, player, pos, vel, timestamp);
      debugPrediction(playerId, predictions);
      pushSnap({ messages, id: playerId, pos, vel, timestamp, predictions });
      clearDirtySnap(player);
    }
  }
}

function collectEnemyDeltas(state: GameState, timestamp: number, messages: PosSnap[]): void {
  const activeRegionIds = createActiveRegionIdSet(state);
  for (const [enemyId, enemy] of Object.entries(state.enemies)) {
    if (!enemy.isAlive || !isEnemyInActiveRegion(state, enemyId, activeRegionIds)) {
      continue;
    }

    const pos = { x: enemy.position.x, z: enemy.position.z };
    const vel = enemy.velocity || { x: 0, z: 0 };

    // Perf: build keyframes only behind the send gate (see the
    // player path above). Most enemies idle/patrol slowly, so the
    // majority of ticks skip the snap — no reason to allocate the
    // prediction array for them.
    if (shouldSendSnap(enemyId, pos, enemy)) {
      const predictions = createPredictionKeyframes({
        entity: enemy,
        currentPos: pos,
        currentVel: vel,
        currentRotY: enemy.rotation?.y || 0,
        timestamp,
        offsetsMs: PREDICTION_TICK_OFFSETS,
        state,
      });
      pushSnap({ messages, id: enemyId, pos, vel, timestamp, predictions });
      clearDirtySnap(enemy);
    }
  }
}

function playerPredictions(
  state: GameState,
  player: PlayerState,
  pos: VecXZ,
  vel: VecXZ,
  timestamp: number,
): PredictionKeyframe[] {
  return createPredictionKeyframes({
    entity: player,
    currentPos: pos,
    currentVel: vel,
    currentRotY: player.rotation?.y || 0,
    timestamp,
    offsetsMs: PREDICTION_TICK_OFFSETS,
    state,
  });
}

function shouldSendSnap(id: string, pos: VecXZ, entity: PlayerState | Enemy): boolean {
  const last = lastSentPos[id];

  if (!last || isDirtySnap(entity)) {
    return true;
  }

  return hasCentimeterDelta(pos, last);
}

function pushSnap({ messages, id, pos, vel, timestamp, predictions }: SnapInput): void {
  messages.push({
    type: 'PosSnap',
    id,
    pos,
    vel,
    snapTs: timestamp,
    predictions: predictions.length > 0 ? predictions : undefined,
  });
  lastSentPos[id] = { ...pos };
}

function hasCentimeterDelta(pos: VecXZ, last: VecXZ): boolean {
  const dx = Math.round((pos.x - last.x) * CM_PER_UNIT);
  const dz = Math.round((pos.z - last.z) * CM_PER_UNIT);
  return dx !== 0 || dz !== 0;
}

function isDirtySnap(entity: PlayerState | Enemy): boolean {
  return Boolean(entity.dirtySnap);
}

function clearDirtySnap(entity: PlayerState | Enemy): void {
  if (isDirtySnap(entity)) {
    entity.dirtySnap = false;
  }
}

// Log every Nth keyframe batch rather than a 1%-random sample: the
// engine carries no ambient RNG, and a fixed stride is just as good a
// spam-limiter for a dev-only diagnostic (and reproducible).
let predictionLogStride = 0;
const PREDICTION_LOG_EVERY = 100;

function debugPrediction(id: string, predictions: PredictionKeyframe[]): void {
  if (predictions.length === 0) {
    return;
  }
  predictionLogStride = (predictionLogStride + 1) % PREDICTION_LOG_EVERY;
  if (predictionLogStride !== 0) {
    return;
  }

  debug(LOG_CATEGORIES.MOVEMENT, `Prediction keyframes for entity ${id}`, {
    keyframes: predictions.map((prediction) => ({
      x: Number(prediction.pos.x.toFixed(2)),
      z: Number(prediction.pos.z.toFixed(2)),
      ts: prediction.ts,
    })),
  });
}
