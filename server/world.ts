import { Server, Socket } from 'socket.io';
import { ZoneManager } from '../packages/content/zones.js';
import { Enemy, PlayerState } from '../shared/types.js';
import { SkillType } from './types.js';
import { CastReq, ClientMessage, MoveIntent, VecXZ, PosSnap,
         ItemDrop, PredictionKeyframe } from '../packages/protocol/messages.js';
import { log, LOG_CATEGORIES } from './logger.js';
import { EffectManager } from './effects/manager';
import { onLearnSkill, onSetSkillShortcut } from './skillHandler.js';
import { SpatialHashGrid, gridCellChanged } from './spatial/SpatialHashGrid';
import { CM_PER_UNIT} from '../shared/netConstants.js';
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

// Constants
const TICK_MS = 1000 / 30; // 30 FPS / Hz world tick rate
const PREDICTION_TICK_OFFSETS = [TICK_MS, TICK_MS * 2]; // Default prediction offsets

/**
 * Calculates the distance between two positions
 */
function distance(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Calculates the direction vector from source to destination
 */
function calculateDir(from: VecXZ, to: VecXZ): { x: number; y: number; z: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  
  // Normalize direction
  if (dist === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: dx / dist,
    y: 0, // Add y component with default 0
    z: dz / dist
  };
}

/**
 * Predicts the position of an entity at a specific timestamp based on its movement
 */
export function predictPosition(
  entity: { position: { x: number; y: number; z: number }, movement?: { targetPos?: VecXZ | null, speed?: number, lastUpdateTime: number } },
  timestamp: number
): VecXZ {
  const dest = entity.movement?.targetPos;
  if (!dest) {
    return { x: entity.position.x, z: entity.position.z };
  }

  const speed = entity.movement.speed ?? 20; // Default to 20 if speed is undefined
  const startTs = entity.movement.lastUpdateTime;
  const currentPos = { x: entity.position.x, y: entity.position.y, z: entity.position.z };

  // Calculate elapsed time in seconds
  const elapsedSec = (timestamp - startTs) / 1000;
  
  // Calculate direction
  const dir = calculateDir(currentPos, dest);
  
  // Calculate distance that would be covered by now
  const distanceCovered = speed * elapsedSec;
  const totalDistance = distance(currentPos, dest);
  
  // If we've reached or passed the destination, return destination
  if (distanceCovered >= totalDistance) {
    return dest;
  }
  
  // Otherwise, interpolate
  return {
    x: currentPos.x + dir.x * distanceCovered,
    z: currentPos.z + dir.z * distanceCovered
  };
}

/**
 * Advances an entity's position based on its movement state
 */
function advancePosition(entity: PlayerState, deltaTimeMs: number): void {
  if (!entity.movement?.targetPos) return;
  
  const currentPosVec = { x: entity.position.x, z: entity.position.z }; // Current position before this tick's movement
  const dest = entity.movement.targetPos;
  const speed = entity.movement.speed;
  
  // Ensure velocity is set if player is supposed to be moving towards a target
  // This also recalculates velocity if the target changes or speed changes.
  if (!entity.velocity || (entity.movement.isMoving && entity.movement.targetPos)) {
    const dir = calculateDir(currentPosVec, dest);
    entity.velocity = {
      x: dir.x * speed,
      z: dir.z * speed
    };
    // If velocity changed significantly, mark as dirty for snapshot
    (entity as any).dirtySnap = true;
  }

  const deltaTimeSec = deltaTimeMs / 1000;
  const stepX = entity.velocity.x * deltaTimeSec;
  const stepZ = entity.velocity.z * deltaTimeSec;

  const distToTargetBeforeMove = distance(currentPosVec, dest);
  const moveAmountThisTick = Math.sqrt(stepX * stepX + stepZ * stepZ);

  const oldPosForGrid = { x: entity.position.x, z: entity.position.z }; // For spatial grid updates

  // Check if the player will reach or overshoot the target in this step,
  // or if they are already very close to the target.
  if (moveAmountThisTick >= distToTargetBeforeMove || distToTargetBeforeMove < 0.05) { // 0.05m = 5cm threshold
    // Snap to destination
    entity.position.x = dest.x;
    entity.position.z = dest.z;
    // entity.position.y remains unchanged or should be set to ground_y if applicable

    // Update spatial grid if cell changed due to snapping
    if (gridCellChanged(oldPosForGrid, { x: entity.position.x, z: entity.position.z })) {
      spatial.move(entity.id, oldPosForGrid, { x: entity.position.x, z: entity.position.z });
    }

    entity.movement.targetPos = null; // Stop movement by clearing target
    entity.movement.isMoving = false; // Update movement state
    entity.velocity = { x: 0, z: 0 }; // Clear velocity as player has stopped
    (entity as any).dirtySnap = true; // Mark for forced snapshot because velocity changed to zero
  } else {
    // Move the player
    entity.position.x += stepX;
    entity.position.z += stepZ;
    // entity.position.y remains unchanged

    // Update spatial grid if cell changed
    if (gridCellChanged(oldPosForGrid, { x: entity.position.x, z: entity.position.z })) {
      spatial.move(entity.id, oldPosForGrid, { x: entity.position.x, z: entity.position.z });
    }
  }
  
  // Update rotation based on movement direction
  if (entity.velocity.x !== 0 || entity.velocity.z !== 0) {
    entity.rotation.y = Math.atan2(entity.velocity.x, entity.velocity.z);
  }
  
  // Update the movement state's last update time
  entity.movement.lastUpdateTime = Date.now();
  
  // Update the position history after movement
  updatePositionHistory(entity, Date.now());
}

/**
 * Advances an enemy's position based on its velocity
 */
function advanceEnemyPosition(enemy: Enemy, deltaTimeMs: number): void {
  if (!enemy.velocity || (enemy.velocity.x === 0 && enemy.velocity.z === 0)) return;
  
  const deltaTimeSec = deltaTimeMs / 1000;
  const stepX = enemy.velocity.x * deltaTimeSec;
  const stepZ = enemy.velocity.z * deltaTimeSec;
  
  const oldPosForGrid = { x: enemy.position.x, z: enemy.position.z }; // For spatial grid updates
  
  // Move the enemy
  enemy.position.x += stepX;
  enemy.position.z += stepZ;
  
  // Update spatial grid if cell changed
  if (gridCellChanged(oldPosForGrid, { x: enemy.position.x, z: enemy.position.z })) {
    spatial.move(enemy.id, oldPosForGrid, { x: enemy.position.x, z: enemy.position.z });
  }
  
  // Update rotation based on movement direction
  if (enemy.velocity.x !== 0 || enemy.velocity.z !== 0) {
    enemy.rotation.y = Math.atan2(enemy.velocity.x, enemy.velocity.z);
  }
  
  // Update position history
  updatePositionHistory(enemy, Date.now());
  
  // Update last update time
  enemy.lastUpdateTime = Date.now();
}

/**
 * Updates the position history of an entity, maintaining a limited history window
 */
function updatePositionHistory(entity: PlayerState | Enemy, timestamp: number): void {
  if (!entity.posHistory) {
    entity.posHistory = [];
  }

  // Add current position to history
  entity.posHistory.push({
    ts: timestamp,
    x: entity.position.x,
    z: entity.position.z
  });
  
  // Trim old entries to keep history within the time window (500ms)
  const MAX_HISTORY_AGE_MS = 500;
  while (entity.posHistory.length > 0 && 
         entity.posHistory[0].ts < timestamp - MAX_HISTORY_AGE_MS) {
    entity.posHistory.shift();
  }
}

/**
 * Advances all entities in the game world by the given time step
 */
function advanceAll(state: GameState, deltaTimeMs: number): void {
  // Process player movements
  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (player.movement?.isMoving && player.movement?.targetPos) {
      advancePosition(player, deltaTimeMs);
    }
  }
  
  // Process enemy movements
  for (const enemyId in state.enemies) {
    const enemy = state.enemies[enemyId];
    if (enemy.isAlive) {
    // Advance enemy position based on velocity
      advanceEnemyPosition(enemy, deltaTimeMs);
    
      // Process status effects
      if (enemy.statusEffects.length > 0) {
        const now = Date.now();
      enemy.statusEffects = enemy.statusEffects.filter(effect => {
        return (effect.startTimeTs + effect.durationMs) > now;
      });
      }
    }
  }
}

// Maintain map of last sent positions for delta compression
const lastSentPos: Record<string, VecXZ> = {};

/**
 * Collects position deltas or individual PosSnap entries for all entities
 * Note: This returns individual PosSnap components
 */
function collectDeltas(
    state: GameState,
    timestamp: number,
    playersToForceInclude: Set<string>
): PosSnap[] {
    const msgs: PosSnap[] = [];

    // Process players
    for (const playerId in state.players) {
        const player = state.players[playerId];
        if (!player.isAlive) continue;

        const pos = predictPosition(player, timestamp); // Server's current authoritative pos
        const vel = player.velocity || { x: 0, z: 0 };
        const last = lastSentPos[playerId];
        
        // Generate predictions for this player
        const predictions: PredictionKeyframe[] = [];
        
        // Current authoritative state
        const currentPos = pos;
        const currentVel = vel;
        const currentRotY = player.rotation?.y || 0;
        
        for (const offsetMs of PREDICTION_TICK_OFFSETS) {
            // Predict state at the given offset
            const predictedState = predictEntityStateAtOffset(
                player, 
                currentPos, 
                currentVel, 
                currentRotY, 
                timestamp, 
                offsetMs, 
                state
            );
            
            // Check if player would stop (reached target)
            let wouldStop = false;
            if (player.movement?.targetPos) {
                const distFromBaseToTarget = distance(currentPos, player.movement.targetPos);
                const distTravelledInOffset = (player.movement.speed || 0) * (offsetMs / 1000.0);
                if (distTravelledInOffset >= distFromBaseToTarget) {
                    wouldStop = true;
                    predictions.push({
                        pos: player.movement.targetPos,
                        rotY: predictedState.rotY,
                        ts: timestamp + offsetMs
                    });
                    break; // Stop adding more predictions if target is reached
                }
            }
            
            if (!wouldStop) {
                predictions.push({
                    pos: predictedState.pos,
                    rotY: predictedState.rotY,
                    ts: timestamp + offsetMs
                });
            }
        }
        
        // Debug predictions occasionally
        if (predictions.length > 0) {
            debugPrediction(playerId, predictions);
        }

        if (playersToForceInclude.has(playerId) || !last) {
            msgs.push({ 
                type: `PosSnap`, 
                id: playerId, 
                pos: pos, 
                vel: vel, 
                snapTs: timestamp,
                predictions: predictions.length > 0 ? predictions : undefined 
            });
            lastSentPos[playerId] = { ...pos };
            if ((player as any).dirtySnap) (player as any).dirtySnap = false;
            continue; // Move to next player
        }

        // If not forced, proceed with delta logic
        const dx = Math.round((pos.x - last.x) * CM_PER_UNIT);
        const dz = Math.round((pos.z - last.z) * CM_PER_UNIT);

        if (dx === 0 && dz === 0) {
             if ((player as any).dirtySnap) { // Still send if dirty
                msgs.push({ 
                    type: `PosSnap`,  
                    id: playerId, 
                    pos: pos, 
                    vel: vel, 
                    snapTs: timestamp,
                    predictions: predictions.length > 0 ? predictions : undefined 
                });
                lastSentPos[playerId] = { ...pos };
                (player as any).dirtySnap = false;
             }
            continue; // No change and not dirty
        }

        msgs.push({ 
            type: `PosSnap`, 
            id: playerId, 
            pos: pos, 
            vel: vel, 
            snapTs: timestamp,
            predictions: predictions.length > 0 ? predictions : undefined 
        });
        lastSentPos[playerId] = { ...pos };
        if ((player as any).dirtySnap) (player as any).dirtySnap = false;
    }
    
    // Process enemies
    for (const enemyId in state.enemies) {
        const enemy = state.enemies[enemyId];
        if (!enemy.isAlive) continue;

        const pos = { x: enemy.position.x, z: enemy.position.z }; // Current enemy position
        const vel = enemy.velocity || { x: 0, z: 0 };
        const last = lastSentPos[enemyId];
        
        // Generate predictions for this enemy
        const predictions: PredictionKeyframe[] = [];
        
        // Current authoritative state
        const currentPos = pos;
        const currentVel = vel;
        const currentRotY = enemy.rotation?.y || 0;
        
        for (const offsetMs of PREDICTION_TICK_OFFSETS) {
            // Predict state at the given offset
            const predictedState = predictEntityStateAtOffset(
                enemy, 
                currentPos, 
                currentVel, 
                currentRotY, 
                timestamp, 
                offsetMs, 
                state
            );
            
            predictions.push({
                pos: predictedState.pos,
                rotY: predictedState.rotY,
                ts: timestamp + offsetMs
            });
        }

        if (!last || (enemy as any).dirtySnap) {
            msgs.push({ 
                type: `PosSnap`, 
                id: enemyId, 
                pos: pos, 
                vel: vel, 
                snapTs: timestamp,
                predictions: predictions.length > 0 ? predictions : undefined
            });
            lastSentPos[enemyId] = { ...pos };
            if ((enemy as any).dirtySnap) (enemy as any).dirtySnap = false;
            continue;
        }

        // Check for significant movement (using the same delta logic as for players)
        const dx = Math.round((pos.x - last.x) * CM_PER_UNIT);
        const dz = Math.round((pos.z - last.z) * CM_PER_UNIT);

        if (dx === 0 && dz === 0) {
            continue; // No significant change
        }

        // Position has changed significantly, send update
        msgs.push({ 
            type: `PosSnap`, 
            id: enemyId, 
            pos: pos, 
            vel: vel, 
            snapTs: timestamp,
            predictions: predictions.length > 0 ? predictions : undefined
        });
        lastSentPos[enemyId] = { ...pos };
    }
    
    return msgs;
}

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
  
  // Handle using the legacy system first for backwards compatibility
  if (!player.unlockedSkills.includes(msg.skillId as SkillType)) {
    console.warn(`Player ${playerId} tried to cast not owned skill: ${msg.skillId}`);
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: 'invalid'
    });
    return;
  }
  
  // Create a simple world object for the skill system
  const world = {
    getEnemyById: (id: string) => state.enemies[id] || null,
    getPlayerById: (id: string) => state.players[id] || null,
    getEntitiesInCircle: (pos: VecXZ, radius: number) => getEntitiesInCircle(state, pos, radius),
    onTargetDied: (caster: PlayerState, target: Enemy | PlayerState) => onTargetDied(caster, target, ioServer)
  };
  
  // Delegate to the server-authoritative castHandler
  handleCastReq(socket, player, msg, ioServer, world, state.activeCasts);
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

// Create effect manager and spatial hash grid instances at the module scope
let effects: EffectManager;
let spatial: SpatialHashGrid;

// Create a reference to the current game state
let globalState: GameState | null = null;

// Debug helper for prediction system
function debugPrediction(id: string, predictions: PredictionKeyframe[]) {
  // Only log occasionally to avoid flooding the console
  if (Math.random() < 0.01) { // 1% chance to log
    console.log(`[Prediction] Entity ${id}: ${predictions.length} keyframes`);
    predictions.forEach((p, i) => {
      console.log(`  Keyframe ${i}: pos=(${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)}), ts=${p.ts}`);
    });
  }
}

/**
 * Initialize the game world
 */

// Utility function to get worldAPI reference
export function initWorld(io: Server, zoneManager: ZoneManager) {
  // Initialize game state
  const state: GameState = createGameState();
  
  // Set the global state reference
  globalState = state;
  
  // Initialize effect manager
  effects = new EffectManager(io, state);
  
  // Initialize the spatial hash grid
  spatial = new SpatialHashGrid();
  
  // Spawn initial enemies
  spawnInitialEnemies(state, spatial, zoneManager);
  
  // Game loop settings
  const TICK = 1000 / 30; // 30 FPS / Hz world tick rate
  // TICK_MS is now defined at the module level
  const SNAP_HZ = 10;     // 10 Hz position snapshots
  let snapAccumulator = 0;
  
  // Start game loop
  setInterval(() => {
    const now = Date.now();

    // Step : Advance all entity states
    advanceAll(state, TICK);
    
    // Step : Update all effects
    effects.updateAll(TICK/1000); // convert to seconds
    
    // Step : Update Enemy AI
    for (const enemyId in state.enemies) {
      const enemy = state.enemies[enemyId];
      if (enemy.isAlive) {
        updateEnemyAI(enemy, state, io, spatial, TICK/1000); // deltaTime is in ms, convert to s
      }
    }
    
    // Step : Process active casts using the new skill system
    const world = {
      getEnemyById: (id: string) => state.enemies[id] || null,
      getPlayerById: (id: string) => state.players[id] || null,
      getEntitiesInCircle: (pos: VecXZ, radius: number) => getEntitiesInCircle(state, pos, radius),
      onTargetDied: (caster: PlayerState, target: Enemy | PlayerState) => onTargetDied(caster, target, io)
    };
    tickCasts(state.activeCasts, TICK, io, world);
    
    // Step : Generate and broadcast position updates at the target rate
    snapAccumulator += 1;
    if (snapAccumulator >= 30 / SNAP_HZ) {
      const msgs = collectDeltas(state, now, new Set());
      if (msgs.length > 0) {
        // Wrap the messages array in a container with its own type to prevent client errors
        io.emit('msg', {
          type: 'BatchUpdate',
          updates: msgs
        });
      }
      snapAccumulator = 0;
    }
    
    // Step : Process mana regeneration (less frequent)
    if (snapAccumulator === 1) {
      handleManaRegeneration(state, io);
    }
    
    // Step : Process enemy respawns (even less frequent)
    if (snapAccumulator === 2) {
      respawnDeadEnemies(state, spatial, io);
    }
  }, TICK);
  
  // Setup periodic player state persistence (every 30s)
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
  }, 30_000);
  
  // Create the world API
  const api = {
    handleMessage(socket: Socket, msg: ClientMessage) {
      switch (msg.type) {
        case 'MoveIntent': return onMoveIntent(socket, state, msg);
        case 'CastReq': return onCastReq(socket, state, msg, io);
        case 'LearnSkill': return onLearnSkill(socket, state, msg);
        case 'SetSkillShortcut': return onSetSkillShortcut(socket, state, msg);
        case 'RespawnRequest': return onRespawnRequest(state, msg, io, spatial);
        case 'UseItem': return onUseItem(socket, state, msg, io);
        case 'LootPickup': {
          const lootMsg = msg;
          console.log(`[LootPickup] Received pickup request: lootId=${lootMsg.lootId}, playerId=${lootMsg.playerId}`);
          console.log(`[LootPickup] Player exists: ${!!state.players[lootMsg.playerId]}`);
          console.log(`[LootPickup] Socket ID matches: ${state.players[lootMsg.playerId]?.socketId === socket.id}`);
          
          if (state.players[lootMsg.playerId]?.socketId === socket.id) {
            if (api.tryGiveLoot(lootMsg.playerId, lootMsg.lootId)) {
              // Send a properly formatted inventory update message
              socket.emit('msg', { 
                type: 'InventoryUpdate',
                playerId: lootMsg.playerId,
                inventory: state.players[lootMsg.playerId].inventory,
                maxInventorySlots: state.players[lootMsg.playerId].maxInventorySlots
              });
              // Log successful pickup
              console.log(`[LootPickup] SUCCESS: Player ${lootMsg.playerId} picked up loot ${lootMsg.lootId}`);
            } else {
              console.log(`[LootPickup] FAILED: Failed to pick up loot: ${lootMsg.lootId} for player ${lootMsg.playerId}`);
            }
          } else {
            console.log(`[LootPickup] REJECTED: Socket ID mismatch or player not found`);
          }
          break;
        }
      }
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
      return removePlayerSessionBySocketId(state, spatial, socketId);
    }
  };

  // Store API reference and return it
  return api;
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

/**
 * Determines a player's movement speed based on their stats and effects
 */
function getPlayerSpeed(player: PlayerState): number {
  // Base speed (can be adjusted for different character classes)
  let speed = 20; // Default movement units per second
  
  // Apply modifier based on player class and stats
  if (player.stats) {
    // Use movement speed if defined, or apply a default multiplier
    if ('movement' in player.stats) {
      speed += player.stats.movement as number;
    } else if (player.stats.dmgMult) {
      // Apply a small boost based on damage multiplier as a fallback
      speed += player.stats.dmgMult * 2;
    }
  }
  
  // Apply status effects that modify speed
  for (const effect of player.statusEffects) {
    if (effect.type === 'speed_boost') {
      speed *= 1.3; // 30% speed boost
    } else if (effect.type === 'slow') {
      speed *= 0.7; // 30% slow
    }
  }
  
  // Ensure speed doesn't exceed maximum allowed value
  const MAX_SPEED = 40;
  speed = Math.min(speed, MAX_SPEED);
  
  return speed;
}

/**
 * Validates if a position is within the allowed game bounds
 */
function isValidPosition(pos: VecXZ): boolean {
  const MAX_POSITION = 1000; // Maximum allowed coordinate value
  
  // Check for NaN or Infinity
  if (isNaN(pos.x) || isNaN(pos.z) || 
      !isFinite(pos.x) || !isFinite(pos.z)) {
    return false;
  }
  
  // Check bounds
  if (Math.abs(pos.x) > MAX_POSITION || Math.abs(pos.z) > MAX_POSITION) {
    return false;
  }
  
  return true;
}

/**
 * Predicts an entity's state at a future time offset from its current state
 * @param entity Player or Enemy entity
 * @param basePos Current position
 * @param baseVel Current velocity
 * @param baseRotY Current rotation Y
 * @param baseTs Server timestamp for basePos/baseVel
 * @param deltaTimeOffsetMs How far into the future to predict (e.g., TICK_MS, 2*TICK_MS)
 * @param gameState Pass gameState for AI predictions if needed
 * @returns Predicted position and rotation
 */
function predictEntityStateAtOffset(
    entity: PlayerState | Enemy,
    basePos: VecXZ,
    baseVel: VecXZ,
    baseRotY: number,
    baseTs: number, 
    deltaTimeOffsetMs: number,
    gameState: GameState
): { pos: VecXZ; rotY: number } {
    try {
        const deltaTimeSec = deltaTimeOffsetMs / 1000.0;
        let predictedPos: VecXZ = { ...basePos };
        let predictedRotY: number = baseRotY;

        // Player prediction (based on current movement intent)
        if ('movement' in entity && (entity as PlayerState).movement?.targetPos && (entity as PlayerState).movement.speed) {
        const player = entity as PlayerState;
        const targetPos = player.movement.targetPos!;
        const speed = player.movement.speed!;
        const dirToTarget = calculateDir(basePos, targetPos);

        const stepX = dirToTarget.x * speed * deltaTimeSec;
        const stepZ = dirToTarget.z * speed * deltaTimeSec;
        const distToTarget = distance(basePos, targetPos);
        const moveAmountThisTick = Math.sqrt(stepX * stepX + stepZ * stepZ);

        if (moveAmountThisTick >= distToTarget || distToTarget < 0.05) {
            predictedPos = { ...targetPos }; // Will reach target
            if (dirToTarget.x !== 0 || dirToTarget.z !== 0) {
                 predictedRotY = Math.atan2(dirToTarget.x, dirToTarget.z);
            }
        } else {
            predictedPos = { x: basePos.x + stepX, z: basePos.z + stepZ };
            if (dirToTarget.x !== 0 || dirToTarget.z !== 0) {
                predictedRotY = Math.atan2(dirToTarget.x, dirToTarget.z);
            }
        }
    }
    // General entity prediction (based on current velocity)
    else if (baseVel && (baseVel.x !== 0 || baseVel.z !== 0)) {
        predictedPos = {
            x: basePos.x + baseVel.x * deltaTimeSec,
            z: basePos.z + baseVel.z * deltaTimeSec,
        };
        // Predict rotation based on velocity direction
        if (baseVel.x !== 0 || baseVel.z !== 0) {
            predictedRotY = Math.atan2(baseVel.x, baseVel.z);
        }
    }

    // Further refinement for AI rotation if chasing/attacking a player
    if ('aiState' in entity && (entity as Enemy).targetId && gameState.players[(entity as Enemy).targetId!]) {
        const enemy = entity as Enemy;
        const targetPlayer = gameState.players[enemy.targetId!];
        const dirToTargetPlayer = calculateDir(predictedPos, targetPlayer.position);
        if (dirToTargetPlayer.x !== 0 || dirToTargetPlayer.z !== 0) {
            predictedRotY = Math.atan2(dirToTargetPlayer.x, dirToTargetPlayer.z);
        }
    }

    return { pos: predictedPos, rotY: predictedRotY };
}
catch (error) {
    console.error('Error in position prediction:', error);
    // Return original position as fallback
    return { pos: basePos, rotY: baseRotY };
}
}
