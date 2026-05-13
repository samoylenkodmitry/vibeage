import { ZoneManager } from '../packages/content/zones.js';
import { Enemy, PlayerState } from '../shared/types.js';
import { ClientMessage, VecXZ, ItemDrop } from '../packages/protocol/messages.js';
import { log, LOG_CATEGORIES } from './logger.js';
import { EffectManager } from './effects/manager';
import { SpatialHashGrid } from './spatial/SpatialHashGrid';
import { tickCasts } from './combat/skillSystem.js';
import { updateEnemyAI } from './ai/enemyAI.js';
import { addGroundLoot, tryGiveLoot } from './loot/groundLoot.js';
import { createGameState, type GameState } from './gameState.js';
import {
  addPlayerSession,
  persistActivePlayers,
  removePlayerSessionBySocketId,
} from './players/playerSession.js';
import {
  handleManaRegeneration,
} from './players/playerLifecycle.js';
import {
  respawnDeadEnemies,
  spawnInitialEnemies,
} from './enemies/enemyLifecycle.js';
import { advanceAll } from './movement/worldMovement.js';
import { collectDeltas, forgetPositionDelta } from './movement/snapshotDeltas.js';
import { handleTargetDeath } from './combat/targetDeath.js';
import { createWorldCombatBridge, handleClientMessage } from './world/clientMessageRouter.js';
import {
  emitBatchUpdate,
  type OutboundEventSink,
  type SocketMessageTarget,
} from './transport/outboundEvents.js';

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
  const effectManager = new EffectManager(outbound, state);
  const spatial = new SpatialHashGrid();
  spawnInitialEnemies(state, spatial, zoneManager);

  startWorldLoop(state, spatial, effectManager, outbound);
  startPersistenceLoop(state);

  return createWorldApi(state, spatial, outbound);
}

function startWorldLoop(
  state: GameState,
  spatial: SpatialHashGrid,
  effectManager: EffectManager,
  outbound: OutboundEventSink,
): void {
  let snapAccumulator = 0;

  setInterval(() => {
    const now = Date.now();

    advanceAll(state, spatial, TICK, now);
    effectManager.updateAll(TICK / 1000);
    updateAllEnemyAI(outbound, state, spatial);
    tickCasts(state.activeCasts, TICK, outbound, createWorldCombatBridge(state, outbound, spatial));

    snapAccumulator += 1;
    if (snapAccumulator >= 30 / SNAP_HZ) {
      const msgs = collectDeltas(state, now, new Set());
      if (msgs.length > 0) {
        emitBatchUpdate(outbound, msgs);
      }
      snapAccumulator = 0;
    }

    if (snapAccumulator === 1) {
      handleManaRegeneration(state, outbound);
    }

    if (snapAccumulator === 2) {
      respawnDeadEnemies(state, spatial, outbound);
    }
  }, TICK);
}

function updateAllEnemyAI(outbound: OutboundEventSink, state: GameState, spatial: SpatialHashGrid): void {
  for (const enemy of Object.values(state.enemies)) {
    if (enemy.isAlive) {
      updateEnemyAI(enemy, state, outbound, spatial, TICK / 1000);
    }
  }
}

function startPersistenceLoop(state: GameState): void {
  let persistenceInFlight = false;
  setInterval(async () => {
    if (persistenceInFlight) {
      log(LOG_CATEGORIES.SYSTEM, 'Skipping periodic player state persistence; previous cycle is still running.');
      return;
    }

    persistenceInFlight = true;
    try {
      log(LOG_CATEGORIES.SYSTEM, 'Running periodic player state persistence...');
      await persistActivePlayers(state);
    } catch (error) {
      console.error('Error in periodic player persistence:', error);
    } finally {
      persistenceInFlight = false;
    }
  }, PERSISTENCE_INTERVAL_MS);
}

function createWorldApi(state: GameState, spatial: SpatialHashGrid, outbound: OutboundEventSink) {
  return {
    handleMessage(socket: WorldClient, msg: ClientMessage) {
      return handleClientMessage(socket, state, msg, outbound, spatial);
    },
    onTargetDied(caster: PlayerState, target: Enemy | PlayerState) {
      return handleTargetDeath(caster, target, { state, spatial, outbound });
    },
    getGameState() {
      return state;
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
    
    async addPlayer(socketId: string, name: string) {
      return addPlayerSession(state, spatial, socketId, name);
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

/**
 * Broadcasts position snapshots of all players to clients
 * Should be called regularly (e.g. 10 Hz) to keep clients in sync
 */
export function broadcastSnaps(outbound: OutboundEventSink, state: GameState): void {
    if (!state.players) return;
    const now = Date.now();
    const playersToForceInclude = new Set<string>();

    for (const playerId in state.players) {
        const player = state.players[playerId];
        if (!player.isAlive) continue;

        const isMoving = player.movement?.isMoving;
        const timeSinceLastSnap = player.lastSnapTime ? (now - player.lastSnapTime) : Infinity;

        // Determine if this player needs a "forced" full snapshot
        // (e.g., for idle refresh or if it's the very first snap)
        if (!isMoving && (!player.lastSnapTime || timeSinceLastSnap > 500)) {
            playersToForceInclude.add(playerId);
        }
        // Always update lastSnapTime if we are considering sending a snap for this player due to idle timeout
        if (playersToForceInclude.has(playerId) || isMoving) { // Or any other condition that leads to sending
             player.lastSnapTime = now;
        }
    }

    // Pass the set of players needing forced updates to collectDeltas
    // collectDeltas will then decide whether to send a full snap or a delta for moving players
    // not in the forced set.
    const snapItems = collectDeltas(state, now, playersToForceInclude);

    if (snapItems.length > 0) {
        emitBatchUpdate(outbound, snapItems);
    }
}
