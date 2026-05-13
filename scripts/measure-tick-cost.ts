import { performance } from 'node:perf_hooks';
import { ZoneManager } from '../packages/content/zones.js';
import { spawnInitialEnemies } from '../server/enemies/enemyLifecycle.js';
import { createGameState } from '../server/gameState.js';
import { advanceAll } from '../server/movement/worldMovement.js';
import { createTransientPlayer } from '../server/playerFactory.js';
import { SpatialHashGrid } from '../server/spatial/SpatialHashGrid.js';

const tickMs = Number(process.env.BASELINE_TICK_MS ?? 1000 / 30);
const ticks = Number(process.env.BASELINE_TICKS ?? 600);
const state = createGameState();
const spatial = new SpatialHashGrid();
const spawnedEnemies = spawnInitialEnemies(state, spatial, new ZoneManager());
const player = createTransientPlayer('baseline-socket', 'Baseline');

state.players[player.id] = player;
spatial.insert(player.id, { x: player.position.x, z: player.position.z });

const startedAt = performance.now();
for (let index = 0; index < ticks; index += 1) {
  advanceAll(state, spatial, tickMs, startedAt + index * tickMs);
}
const elapsedMs = performance.now() - startedAt;

console.log(JSON.stringify({
  ticks,
  tickMs,
  spawnedEnemies,
  totalMs: round(elapsedMs),
  averageTickMs: round(elapsedMs / ticks),
}));

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
