/**
 * SimWorld — drives the REAL world tick pipeline on a virtual clock.
 *
 * This is the payoff of the clock-injection work (B2): because every
 * engine system now takes `now` as a parameter, the exact same
 * `createWorldTickRunner` the live Colyseus room runs can be advanced
 * deterministically off a `SimClock` with no wall clock, no timers, and
 * no GPU client. Schedule the tick on the clock (`every(tickMs)`) and
 * `advance(ms)` drains the due ticks in time order — "put events in a
 * queue and advance time", running the production engine itself rather
 * than a parallel model.
 *
 * Two drivers, one engine: the live room feeds `Date.now()`, this feeds
 * `SimClock.now()`; both call the identical systems.
 */
import { ZoneManager } from '../../packages/content/zones.js';
import { SimClock } from '../../packages/sim/simClock.js';
import { createGameState, type GameState } from '../gameState.js';
import { spawnInitialEnemies } from '../enemies/enemyLifecycle.js';
import { SpatialHashGrid } from '../spatial/SpatialHashGrid.js';
import type { OutboundEvent, OutboundEventSink } from '../transport/outboundEvents.js';
import { createServerOwnedRegions, type ServerWorldRegion } from '../world/regions.js';
import { createWorldTickRunner } from '../world/tickPipeline.js';
import { DEFAULT_WORLD_ZONE_SPAWN_POLICY, initializeServerDrivenZoneRuntime } from '../world/zoneRuntime.js';

const DEFAULT_TICK_MS = 1000 / 30; // matches the live server loop (30 Hz)
const DEFAULT_SNAP_HZ = 10;

export interface SimWorldOptions {
  /** Provide a custom zone set; defaults to the real world's zones. */
  zoneManager?: ZoneManager;
  /** Spawn each active zone's initial mob population at t=0. */
  seedEnemies?: boolean;
  /** Virtual start time (ms). Default 0. */
  startMs?: number;
  tickMs?: number;
  snapHz?: number;
}

export interface SimWorld {
  readonly state: GameState;
  readonly spatial: SpatialHashGrid;
  readonly clock: SimClock;
  readonly zoneManager: ZoneManager;
  readonly regions: readonly ServerWorldRegion[];
  /** Every outbound event the real pipeline has published so far. */
  readonly events: OutboundEvent[];
  /** Advance virtual time by `ms`, running the real tick at the configured rate. */
  advance(ms: number): void;
  /** Current virtual time (ms). */
  now(): number;
}

export function createSimWorld(options: SimWorldOptions = {}): SimWorld {
  const zoneManager = options.zoneManager ?? new ZoneManager();
  const tickMs = options.tickMs ?? DEFAULT_TICK_MS;
  const snapHz = options.snapHz ?? DEFAULT_SNAP_HZ;

  const clock = new SimClock(options.startMs ?? 0);
  const state = createGameState();
  const spatial = new SpatialHashGrid();
  const events: OutboundEvent[] = [];
  const outbound: OutboundEventSink = { publish: (event) => events.push(event) };

  const regions = createServerOwnedRegions(zoneManager, DEFAULT_WORLD_ZONE_SPAWN_POLICY);
  initializeServerDrivenZoneRuntime(state, regions, DEFAULT_WORLD_ZONE_SPAWN_POLICY);

  if (options.seedEnemies) {
    // Populate active zones the way the live boot does. NB: zone spawn
    // positions still draw from the content layer's Math.random, so a
    // seeded full world is reproducible in *structure* but not exact
    // mob coordinates — fine for a smoke run, not a determinism assert.
    spawnInitialEnemies(state, spatial, zoneManager, clock.now(), {
      activeZoneIds: state.zones.activeZoneIds,
      maxEnemies: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxActiveEnemies,
      maxEnemiesPerZone: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxEnemiesPerZone,
    });
  } else {
    // Bring-your-own-enemies mode: mark the active zones as already
    // spawned so the tick's first-activation auto-spawn stays a no-op.
    // The caller adds exactly the entities it wants — making the run
    // fully deterministic (no ambient spawn RNG).
    state.zones.spawnedZoneIds = [...state.zones.activeZoneIds];
  }

  const runner = createWorldTickRunner({ state, spatial, outbound, tickMs, snapHz, regions, zoneManager });
  // The clock owns the tick cadence: each due slot fires the real
  // pipeline with the virtual `now`, so advancing time replays exactly
  // what the live loop would do over the same span.
  clock.every(tickMs, () => runner.tick(clock.now()));

  return {
    state,
    spatial,
    clock,
    zoneManager,
    regions,
    events,
    advance: (ms: number) => clock.advanceBy(ms),
    now: () => clock.now(),
  };
}
