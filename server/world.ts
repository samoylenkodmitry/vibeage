import { ZoneManager } from '../packages/content/zones.js';
import { Enemy, PlayerState } from '../packages/sim/entities.js';
import { ClientMessage, VecXZ, ItemDrop } from '../packages/protocol/messages.js';
import { debug, error as logError, LOG_CATEGORIES } from './logger.js';
import { SpatialHashGrid } from './spatial/SpatialHashGrid';
import { addGroundLoot, tryGiveLoot } from './loot/groundLoot.js';
import { createGameState, type GameState } from './gameState.js';
import {
  addPlayerSession,
  persistActivePlayers,
  removePlayerSessionBySocketId,
} from './players/playerSession.js';
import { spawnInitialEnemies } from './enemies/enemyLifecycle.js';
import { forgetPositionDelta } from './movement/snapshotDeltas.js';
import { handleTargetDeath } from './combat/targetDeath.js';
import { createWorldCombatBridge, handleClientMessage } from './world/clientMessageRouter.js';
import { type OutboundEventSink, type SocketMessageTarget } from './transport/outboundEvents.js';
import {
  DEFAULT_WORLD_ZONE_SPAWN_POLICY,
  initializeServerDrivenZoneRuntime,
} from './world/zoneRuntime.js';
import { createWorldTickRunner } from './world/tickPipeline.js';
import { createServerOwnedRegions, type ServerWorldRegion } from './world/regions.js';

const TICK = 1000 / 30;
const SNAP_HZ = 10;
const PERSISTENCE_INTERVAL_MS = 30_000;
type WorldClient = SocketMessageTarget & { id: string };

/**
 * Initialize the game world
 */

// Utility function to get worldAPI reference
export function initWorld(outbound: OutboundEventSink, zoneManager: ZoneManager) {
  const state: GameState = createGameState();
  const spatial = new SpatialHashGrid();
  const regions = createServerOwnedRegions(zoneManager, DEFAULT_WORLD_ZONE_SPAWN_POLICY);
  initializeServerDrivenZoneRuntime(state, regions, DEFAULT_WORLD_ZONE_SPAWN_POLICY);
  spawnInitialEnemies(state, spatial, zoneManager, Date.now(), {
    activeZoneIds: state.zones.activeZoneIds,
    maxEnemies: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxActiveEnemies,
    maxEnemiesPerZone: DEFAULT_WORLD_ZONE_SPAWN_POLICY.maxEnemiesPerZone,
  });

  startWorldLoop(state, spatial, outbound, regions, zoneManager);
  startPersistenceLoop(state);

  return createWorldApi(state, spatial, outbound, regions);
}

function startWorldLoop(
  state: GameState,
  spatial: SpatialHashGrid,
  outbound: OutboundEventSink,
  regions: readonly ServerWorldRegion[],
  zoneManager: ZoneManager,
): void {
  const runner = createWorldTickRunner({ state, spatial, outbound, tickMs: TICK, snapHz: SNAP_HZ, regions, zoneManager });

  setInterval(() => {
    runner.tick();
  }, TICK);
}

function startPersistenceLoop(state: GameState): void {
  let persistenceInFlight = false;
  setInterval(async () => {
    if (persistenceInFlight) {
      debug(LOG_CATEGORIES.SYSTEM, 'Skipping periodic player state persistence; previous cycle is still running.');
      return;
    }

    persistenceInFlight = true;
    try {
      debug(LOG_CATEGORIES.SYSTEM, 'Running periodic player state persistence...');
      await persistActivePlayers(state);
    } catch (error) {
      logError(LOG_CATEGORIES.SYSTEM, 'Error in periodic player persistence', error);
    } finally {
      persistenceInFlight = false;
    }
  }, PERSISTENCE_INTERVAL_MS);
}

function createWorldApi(
  state: GameState,
  spatial: SpatialHashGrid,
  outbound: OutboundEventSink,
  regions: readonly ServerWorldRegion[],
) {
  return {
    handleMessage(socket: WorldClient, msg: ClientMessage) {
      return handleClientMessage(socket, state, msg, outbound, spatial);
    },
    onTargetDied(caster: PlayerState, target: Enemy | PlayerState, now: number) {
      return handleTargetDeath(caster, target, { state, spatial, outbound, now });
    },
    getGameState() {
      return state;
    },

    getRegions() {
      return regions;
    },
    
    getEntitiesInCircle(pos: VecXZ, radius: number) {
      return createWorldCombatBridge(state, outbound, spatial).getEntitiesInCircle(pos, radius);
    },
    
    // Expose the spatial grid for direct access
    spatial,
    
    // Loot management methods
    addGroundLoot(enemyId: string, loot: ItemDrop[]) {
      return addGroundLoot(state, enemyId, loot);
    },
    
    tryGiveLoot(playerId: string, lootId: string) {
      return tryGiveLoot(state, outbound, playerId, lootId);
    },
    
    async addPlayer(socketId: string, name: string, options?: { initialRace?: string; initialClass?: string; accountId?: string }) {
      return addPlayerSession(state, spatial, socketId, name, Date.now(), options);
    },
    
    async removePlayerBySocketId(socketId: string) {
      const playerId = await removePlayerSessionBySocketId(state, spatial, socketId);
      if (playerId) {
        forgetPositionDelta(playerId);
      }
      return playerId;
    }
  };
}
