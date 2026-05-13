import { Server, Socket } from 'socket.io';
import { ZoneManager } from '../packages/content/zones.js';
import { Enemy, PlayerState } from '../shared/types.js';
import { CastReq, ClientMessage, MoveIntent, VecXZ, ItemDrop, type LootPickup } from '../packages/protocol/messages.js';
import { log, LOG_CATEGORIES } from './logger.js';
import { EffectManager } from './effects/manager';
import { onLearnSkill, onSetSkillShortcut } from './skillHandler.js';
import { SpatialHashGrid } from './spatial/SpatialHashGrid';
import { handleCastReq } from './combat/castHandler.js';
import { tickCasts } from './combat/skillSystem.js';
import { updateEnemyAI } from './ai/enemyAI.js';
import { addGroundLoot, spawnLootForEnemyDeath, tryGiveLoot } from './loot/groundLoot.js';
import { createGameState, type GameState } from './gameState.js';
import {
  addPlayerSession,
  persistActivePlayers,
  removePlayerSessionBySocketId,
} from './players/playerSession.js';
import { onUseItem } from './inventory/itemUse.js';
import {
  awardPlayerXP,
  handleManaRegeneration,
  onRespawnRequest,
} from './players/playerLifecycle.js';
import {
  respawnDeadEnemies,
  spawnInitialEnemies,
} from './enemies/enemyLifecycle.js';
import {
  advanceAll,
  calculateDir,
  distance,
  getPlayerSpeed,
  isValidPosition,
} from './movement/worldMovement.js';
import { collectDeltas, forgetPositionDelta } from './movement/snapshotDeltas.js';

/**
 * Handles CastReq message using the new server-authoritative skill system
 * @param ioServer The Socket.IO server instance
 */
function onCastReq(socket: Socket, state: GameState, msg: CastReq, ioServer: Server): void {
  const playerId = msg.id;
  const player = state.players[playerId];
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    return;
  }
  
  handleCastReq(socket, player, msg, ioServer, createSkillWorld(state, ioServer), state.activeCasts);
}

function createSkillWorld(state: GameState, io: Server) {
  return {
    getEnemyById: (id: string) => state.enemies[id] || null,
    getPlayerById: (id: string) => state.players[id] || null,
    getEntitiesInCircle: (pos: VecXZ, radius: number) => getEntitiesInCircle(state, pos, radius),
    onTargetDied: (caster: PlayerState, target: Enemy | PlayerState) => onTargetDied(caster, target, io)
  };
}

/**
 * Helper to get entities in a circle
 */
function getEntitiesInCircle(state: GameState, pos: VecXZ, radius: number): any[] {
  const result: any[] = [];
  
  // Check enemies
  for (const enemyId in state.enemies) {
    const enemy = state.enemies[enemyId];
    if (!enemy.isAlive) continue;
    
    const dx = enemy.position.x - pos.x;
    const dz = enemy.position.z - pos.z;
    const distSq = dx * dx + dz * dz;
    
    if (distSq <= radius * radius) {
      result.push(enemy);
    }
  }
  
  // Check players (for PvP if enabled)
  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (!player.isAlive) continue;
    
    const dx = player.position.x - pos.x;
    const dz = player.position.z - pos.z;
    const distSq = dx * dx + dz * dz;
    
    if (distSq <= radius * radius) {
      result.push(player);
    }
  }
  
  return result;
}

const TICK = 1000 / 30;
const SNAP_HZ = 10;
const PERSISTENCE_INTERVAL_MS = 30_000;

// Create spatial hash grid instance at the module scope for legacy target death handling.
let spatial: SpatialHashGrid;

// Create a reference to the current game state
let globalState: GameState | null = null;

/**
 * Initialize the game world
 */

// Utility function to get worldAPI reference
export function initWorld(io: Server, zoneManager: ZoneManager) {
  const state: GameState = createGameState();
  globalState = state;

  const effectManager = new EffectManager(io, state);
  spatial = new SpatialHashGrid();
  spawnInitialEnemies(state, spatial, zoneManager);

  startWorldLoop(io, state, spatial, effectManager);
  startPersistenceLoop(state);

  return createWorldApi(io, state, spatial);
}

function startWorldLoop(
  io: Server,
  state: GameState,
  spatial: SpatialHashGrid,
  effectManager: EffectManager,
): void {
  let snapAccumulator = 0;

  setInterval(() => {
    const now = Date.now();

    advanceAll(state, spatial, TICK, now);
    effectManager.updateAll(TICK / 1000);
    updateAllEnemyAI(io, state, spatial);
    tickCasts(state.activeCasts, TICK, io, createSkillWorld(state, io));

    snapAccumulator += 1;
    if (snapAccumulator >= 30 / SNAP_HZ) {
      const msgs = collectDeltas(state, now, new Set());
      if (msgs.length > 0) {
        io.emit('msg', { type: 'BatchUpdate', updates: msgs });
      }
      snapAccumulator = 0;
    }

    if (snapAccumulator === 1) {
      handleManaRegeneration(state, io);
    }

    if (snapAccumulator === 2) {
      respawnDeadEnemies(state, spatial, io);
    }
  }, TICK);
}

function updateAllEnemyAI(io: Server, state: GameState, spatial: SpatialHashGrid): void {
  for (const enemy of Object.values(state.enemies)) {
    if (enemy.isAlive) {
      updateEnemyAI(enemy, state, io, spatial, TICK / 1000);
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

function createWorldApi(io: Server, state: GameState, spatial: SpatialHashGrid) {
  return {
    handleMessage(socket: Socket, msg: ClientMessage) {
      return handleClientMessage(socket, state, msg, io, spatial);
    },
    onTargetDied(caster: PlayerState, target: Enemy | PlayerState) {
      return onTargetDied(caster, target, io);
    },
    getGameState() {
      return state;
    },
    
    getEntitiesInCircle(pos: VecXZ, radius: number) {
      // Use spatial hash grid to get entity IDs within the circle
      const entityIds = spatial.queryCircle(pos, radius);
      
      // Convert IDs back to entities
      return entityIds.map(id => {
        // Check if it's a player
        if (id in state.players && state.players[id].isAlive) {
          return state.players[id];
        }
        // Check if it's an enemy
        if (id in state.enemies && state.enemies[id].isAlive) {
          return state.enemies[id];
        }
        return null;
      }).filter(Boolean); // Remove null entries
    },
    
    // Expose the spatial grid for direct access
    spatial,
    
    // Loot management methods
    addGroundLoot(enemyId: string, loot: ItemDrop[]) {
      return addGroundLoot(state, enemyId, loot);
    },
    
    tryGiveLoot(playerId: string, lootId: string) {
      return tryGiveLoot(state, io, playerId, lootId);
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

function handleClientMessage(
  socket: Socket,
  state: GameState,
  msg: ClientMessage,
  io: Server,
  spatial: SpatialHashGrid,
): void {
  switch (msg.type) {
    case 'MoveIntent': return onMoveIntent(socket, state, msg);
    case 'CastReq': return onCastReq(socket, state, msg, io);
    case 'LearnSkill': return onLearnSkill(socket, state, msg);
    case 'SetSkillShortcut': return onSetSkillShortcut(socket, state, msg);
    case 'RespawnRequest': return onRespawnRequest(state, msg, io, spatial);
    case 'UseItem': return onUseItem(socket, state, msg, io);
    case 'LootPickup': return onLootPickup(socket, state, msg, io);
  }
}

function onLootPickup(socket: Socket, state: GameState, msg: LootPickup, io: Server): void {
  if (state.players[msg.playerId]?.socketId !== socket.id) {
    return;
  }

  if (!tryGiveLoot(state, io, msg.playerId, msg.lootId)) {
    return;
  }

  socket.emit('msg', {
    type: 'InventoryUpdate',
    playerId: msg.playerId,
    inventory: state.players[msg.playerId].inventory,
    maxInventorySlots: state.players[msg.playerId].maxInventorySlots
  });
}

function onTargetDied(caster: PlayerState, target: Enemy | PlayerState, io: Server): void {
  console.log(`Target died: ${JSON.stringify(target)}`);
  if (target.isAlive) {
    target.isAlive = false;
    target.deathTimeTs = Date.now();
    target.health = 0;
    
    // Remove from spatial hash grid
    spatial.remove(target.id, { x: target.position.x, z: target.position.z });
    
    // Award XP to the caster
    if (caster && caster.isAlive) {
      if ('baseExperienceValue' in target) {
        // Handle mob kill
        const xpAmount = target.baseExperienceValue;
        io.emit('playerUpdated', awardPlayerXP(caster, xpAmount, `killing ${target.name}`));
        
        if ('lootTableId' in target && target.lootTableId && globalState) {
          spawnLootForEnemyDeath(globalState, io, target as Enemy);
        }
      }
    }
  }
}

/**
 * Broadcasts position snapshots of all players to clients
 * Should be called regularly (e.g. 10 Hz) to keep clients in sync
 */
export function broadcastSnaps(io: Server, state: GameState): void {
    if (!io || !state.players) return;
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
        io.emit('msg', { type: 'BatchUpdate', updates: snapItems });
    }
}

/**
 * Handles MoveIntent messages from clients requesting to move to a target position
 * This replaces the old MoveStart handler in the server-authoritative movement system
 */
function onMoveIntent(socket: Socket, state: GameState, msg: MoveIntent): void {
  const playerId = msg.id;
  const player = state.players[playerId];
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    console.warn(`Invalid player ID or wrong socket for MoveIntent: ${playerId}`);
    return;
  }
  
  // Validate the target position is within reasonable bounds
  if (!isValidPosition(msg.targetPos)) {
    console.warn(`Invalid target position in MoveIntent from player ${playerId}: ${JSON.stringify(msg.targetPos)}`);
    return;
  }

  // Get current position
  const currentPos = { x: player.position.x, z: player.position.z };
  const now = Date.now();
  
  // Calculate the distance to the target
  const distanceToTarget = distance(currentPos, msg.targetPos);
  
  // For very small movements (effectively a stop command)
  if (distanceToTarget < 0.05) {
    // This is a stop command - immediately halt the player
    player.movement = { 
      isMoving: false,
      lastUpdateTime: now,
      speed: getPlayerSpeed(player) // Set a default speed even when stopped
    };
    player.velocity = { x: 0, z: 0 };
    
    // Mark for forced snapshot because velocity changed to zero
    (player as any).dirtySnap = true;
    
    return;
  }
  
  // Calculate direction towards target
  const dir = calculateDir(currentPos, msg.targetPos);
  
  // Determine server-authorized speed (can vary based on player stats, buffs, etc.)
  const speed = getPlayerSpeed(player); // Server decides the speed
  
  // Update player's movement state
  player.movement = {
    isMoving: true,
    targetPos: msg.targetPos,
    lastUpdateTime: now,
    speed: speed
  };
  
  // Set velocity for movement simulation
  player.velocity = {
    x: dir.x * speed,
    z: dir.z * speed
  };
  
  // Update rotation to face movement direction
  player.rotation.y = Math.atan2(dir.x, dir.z);
  
  // Update last processed time
  player.lastUpdateTime = now;
  
  // Mark the player for sending a snapshot update
  (player as any).dirtySnap = true;
  
  // Log movement (debug level)
  log(LOG_CATEGORIES.MOVEMENT, 'debug', `Player ${playerId} moving to ${JSON.stringify(msg.targetPos)} at speed ${speed}`);
}
