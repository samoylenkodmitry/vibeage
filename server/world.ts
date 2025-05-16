import { Server, Socket } from 'socket.io';
import { ZoneManager } from '../shared/zoneSystem.js';
import { Enemy, PlayerState, InventorySlot } from '../shared/types.js';
import { SkillType, Projectile } from './types.js';
import { isPathBlocked, sweptHit } from './collision.js';
import { ClientMsg, CastReq, VecXZ, LearnSkill, SetSkillShortcut, MoveIntent, RespawnRequest, InventoryUpdateMsg, LootAcquiredMsg, PosSnap, SinglePosSnap } from '../shared/messages.js';
import { log, LOG_CATEGORIES } from './logger.js';
import { EffectManager } from './effects/manager';
import { SKILLS, SkillId } from '../shared/skillsDefinition.js';
import { onLearnSkill, onSetSkillShortcut } from './skillHandler.js';
import { predictPosition as sharedPredictPosition } from '../shared/positionUtils.js';
import { SpatialHashGrid, gridCellChanged } from './spatial/SpatialHashGrid';
import { getDamage, hash, rng } from '../shared/combatMath.js';
import { CM_PER_UNIT, POS_MAX_DELTA_CM } from '../shared/netConstants.js';
import { handleCastReq } from './combat/castHandler.js';
import { tickCasts } from './combat/skillSystem.js';
import { updateEnemyAI } from './ai/enemyAI.js';
import { LOOT_TABLES, LootTable } from './lootTables.js';

/**
 * Defines the GameState interface
 */
interface GameState {
  players: Record<string, PlayerState>;
  enemies: Record<string, Enemy>;
  projectiles: Projectile[];
  lastProjectileId: number;
}

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
  if (!entity.velocity || (entity.velocity.x === 0 && entity.velocity.z === 0 && entity.movement.targetPos)) {
    const dir = calculateDir(currentPosVec, dest);
    entity.velocity = {
      x: dir.x * speed,
      z: dir.z * speed
    };
    // If velocity was zero and is now non-zero (i.e., player started moving), mark as dirty for snapshot
    if (dir.x !== 0 || dir.z !== 0) {
        (entity as any).dirtySnap = true;
    }
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
  
  // Update the position history after movement
  updatePositionHistory(entity, Date.now());
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
    if (player.movement?.targetPos) {
      advancePosition(player, deltaTimeMs);
    }
  }
  
  // Process enemy logic, status effects, etc.
  for (const enemyId in state.enemies) {
    const enemy = state.enemies[enemyId];
    const now = Date.now();

    // Update position history for all enemies at each tick
    updatePositionHistory(enemy, now);
    enemy.lastUpdateTime = now;
    
    // Process enemy targeting and movement here
    if (enemy.isAlive && enemy.targetId) {
      const target = state.players[enemy.targetId];
      if (target && target.isAlive) {
        // Calculate target position prediction

        // Movement logic for enemy to follow target
        // (Simplified for now)
      }
    }
    
    // Process status effects (could be moved to a separate function)
    if (enemy.statusEffects.length > 0) {
      enemy.statusEffects = enemy.statusEffects.filter(effect => {
        return (effect.startTimeTs + effect.durationMs) > now;
      });
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

    for (const playerId in state.players) {
        const player = state.players[playerId];
        if (!player.isAlive) continue;

        const pos = predictPosition(player, timestamp); // Server's current authoritative pos
        const vel = player.velocity || { x: 0, z: 0 };
        const last = lastSentPos[playerId];

        if (playersToForceInclude.has(playerId) || !last) {
            msgs.push({ type: `PosSnap`, id: playerId, pos: pos, vel: vel, snapTs: timestamp });
            lastSentPos[playerId] = { ...pos };
            if ((player as any).dirtySnap) (player as any).dirtySnap = false;
            continue; // Move to next player
        }

        // If not forced, proceed with delta logic
        const dx = Math.round((pos.x - last.x) * CM_PER_UNIT);
        const dz = Math.round((pos.z - last.z) * CM_PER_UNIT);

        if (dx === 0 && dz === 0) {
             if ((player as any).dirtySnap) { // Still send if dirty
                msgs.push({ type: `PosSnap`,  id: playerId, pos: pos, vel: vel, snapTs: timestamp });
                lastSentPos[playerId] = { ...pos };
                (player as any).dirtySnap = false;
             }
            continue; // No change and not dirty
        }

        msgs.push({ type: `PosSnap`, id: playerId, pos: pos, vel: vel, snapTs: timestamp });
        lastSentPos[playerId] = { ...pos };
        if ((player as any).dirtySnap) (player as any).dirtySnap = false;
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
    getEntitiesInCircle: (pos: VecXZ, radius: number) => getEntitiesInCircle(state, pos, radius)
  };
  
  // Delegate to the server-authoritative castHandler
  handleCastReq(socket, player, msg, ioServer, world);
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


/**
 * Initialize the game world
 */
// Create an effects variable at module scope
let effects: EffectManager;
// Create a spatial hash grid at module scope
let spatial: SpatialHashGrid;

export function initWorld(io: Server, zoneManager: ZoneManager) {
  // Initialize game state
  const state: GameState = {
    players: {},
    enemies: {},
    projectiles: [],
    lastProjectileId: 0
  };
  
  // Initialize effect manager
  effects = new EffectManager(io, state);
  
  // Initialize the spatial hash grid
  spatial = new SpatialHashGrid();
  
  // Spawn initial enemies
  spawnInitialEnemies(state, zoneManager);
  
  // Game loop settings
  const TICK = 1000 / 30; // 30 FPS / Hz world tick rate
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
      getEntitiesInCircle: (pos: VecXZ, radius: number) => getEntitiesInCircle(state, pos, radius)
    };
    tickCasts(TICK, io, world);
    
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
      handleEnemyRespawns(state, io);
    }
  }, TICK);
  
  // Return public API
  return {
    handleMessage(socket: Socket, msg: ClientMsg) {
      switch (msg.type) {
        case 'MoveIntent': return onMoveIntent(socket, state, msg as MoveIntent);
        case 'CastReq': return onCastReq(socket, state, msg as CastReq, io);
        case 'LearnSkill': return onLearnSkill(socket, state, msg as LearnSkill);
        case 'SetSkillShortcut': return onSetSkillShortcut(socket, state, msg as SetSkillShortcut);
        case 'RespawnRequest': return onRespawnRequest(socket, state, msg as RespawnRequest, io);
      }
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
    
    addPlayer(socketId: string, name: string) {
      const playerId = `player-${hash(socketId + Date.now().toString())}`;
      
      const player: PlayerState = {
        id: playerId,
        socketId,
        name,
        position: { x: 0, y: 0.5, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        health: 100,
        maxHealth: 100,
        mana: 100,
        maxMana: 100,
        level: 2,
        experience: 0,
        experienceToNextLevel: 100,
        statusEffects: [],
        skillCooldownEndTs: {},
        castingSkill: null,
        castingProgressMs: 0,
        isAlive: true,
        className: 'mage', // Default class
        unlockedSkills: ['fireball'], // Start with fireball
        skillShortcuts: ['fireball', null, null, null, null, null, null, null, null], // Assign fireball to shortcut 1
        availableSkillPoints: 1, // Give the player 1 skill point to start
        posHistory: [], // Initialize position history
        lastUpdateTime: Date.now(),
        inventory: [], // Initialize empty inventory
        maxInventorySlots: 20 // Set default inventory size
      };
      
      state.players[playerId] = player;
      
      // Add player to spatial hash grid
      spatial.insert(playerId, { x: player.position.x, z: player.position.z });
      
      return player;
    },
    
    removePlayerBySocketId(socketId: string) {
      const playerId = Object.keys(state.players).find(
        id => state.players[id].socketId === socketId
      );
      
      if (playerId) {
        // Get player position before removing
        const player = state.players[playerId];
        const pos = { x: player.position.x, z: player.position.z };
        
        // Remove player from spatial hash grid
        spatial.remove(playerId, pos);
        
        // Remove player from state
        delete state.players[playerId];
        
        return playerId;
      }
      
      return null;
    }
  };
}

/**
 * Helper to spawn initial enemies
 */
function spawnInitialEnemies(state: GameState, zoneManager: ZoneManager) {
  const GAME_ZONES = zoneManager.getZones();
  
  GAME_ZONES.forEach((zone) => {
    const mobsToSpawn = zoneManager.getMobsToSpawn(zone.id);
    mobsToSpawn.forEach((mobConfig) => {
      const { type, count } = mobConfig;
      for (let i = 0; i < count; i++) {
        const position = zoneManager.getRandomPositionInZone(zone.id);
        if (!position) continue;

        const enemyId = `${type}-${hash(`${type}-${Date.now()}-${position.x}-${position.z}`).toString(36).substring(0, 9)}`;
        const level = zoneManager.getMobLevel(zone.id);

        state.enemies[enemyId] = {
          id: enemyId,
          type,
          name: type.charAt(0).toUpperCase() + type.slice(1),
          level,
          position,
          spawnPosition: { ...position },
          rotation: { x: 0, y: rng(hash(`rotation-${Date.now()}-${position.x}-${position.z}`))() * Math.PI * 2, z: 0 },
          health: 100 + (level * 20),
          maxHealth: 100 + (level * 20),
          isAlive: true,
          attackDamage: 10 + (level * 2),
          attackRange: 2,
          baseExperienceValue: 50 + (level * 10),
          experienceValue: 50 + (level * 10),
          statusEffects: [],
          targetId: null,
          
          // AI-related fields
          aiState: 'idle',
          aggroRadius: 15, // Default aggro radius
          attackCooldownMs: 2000, // Default attack cooldown (2 seconds)
          lastAttackTime: 0,
          movementSpeed: 6, // Default movement speed
          velocity: { x: 0, z: 0 },
          
          // Assign appropriate loot table ID based on enemy type
          lootTableId: `${type}_loot`
        };
        
        // Add enemy to spatial hash grid
        spatial.insert(enemyId, { x: position.x, z: position.z });
      }
    });
  });
}

/**
 * Awards XP to a player and handles level ups
 * @param player The player to award XP to
 * @param xpAmount Amount of XP to award
 * @param sourceInfo Information about the source of XP (for logging)
 * @param io Server instance for broadcasting updates
 */
export function awardPlayerXP(player: PlayerState, xpAmount: number, sourceInfo: string, io: Server): void {
  const oldExp = player.experience;
  player.experience += xpAmount;
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} gained ${xpAmount} XP from ${sourceInfo}. XP: ${oldExp} -> ${player.experience}`);
  
  // Check for level up
  if (player.experience >= player.experienceToNextLevel) {
    const oldLevel = player.level;
    const oldSkillPoints = player.availableSkillPoints;
    
    player.level += 1;
    const oldMaxExp = player.experienceToNextLevel;
    player.experience -= player.experienceToNextLevel; // Keep excess XP
    player.experienceToNextLevel = Math.floor(oldMaxExp * 1.5); // 50% more XP needed for next level
    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} leveled up to level ${player.level}! Next level at ${player.experienceToNextLevel} XP`);
    
    // Increase max health and mana with level
    player.maxHealth = 100 + (player.level - 1) * 20;
    player.maxMana = 100 + (player.level - 1) * 10;
    
    // Heal player on level up
    player.health = player.maxHealth;
    player.mana = player.maxMana;
    
    // Award a skill point on level up
    player.availableSkillPoints += 1;
    log(LOG_CATEGORIES.PLAYER, `Player ${player.id} gained a skill point. Total: ${player.availableSkillPoints} (before: ${oldSkillPoints})`);
    
    console.log(`[LEVEL_UP] Player ${player.id}: Level ${oldLevel} -> ${player.level}, Skill Points: ${oldSkillPoints} -> ${player.availableSkillPoints}`);
  }
  
  // Broadcast the updated player state so clients see XP and level changes
  io.emit('playerUpdated', {
    id: player.id,
    experience: player.experience,
    experienceToNextLevel: player.experienceToNextLevel,
    level: player.level,
    maxHealth: player.maxHealth,
    health: player.health,
    maxMana: player.maxMana,
    mana: player.mana,
    availableSkillPoints: player.availableSkillPoints
  });
}

/**
 * Spawns a projectile in the world
 */
function spawnProjectile(
  state: GameState,
  casterId: string,
  skillId: SkillId,
  pos: VecXZ,
  dir: VecXZ,
  speed: number,
  targetId?: string
): Projectile {
  const projectileId = `proj_${state.lastProjectileId++}`;
  
  // Offset the initial position slightly in the direction of travel
  // This helps avoid collisions with the caster when spawning projectiles
  const offsetDistance = 0.5; // Small offset to move projectile away from caster
  const initialPos = {
    x: pos.x + dir.x * offsetDistance,
    z: pos.z + dir.z * offsetDistance
  };
  
  const projectile: Projectile = {
    id: projectileId,
    casterId,
    skillId,
    pos: { ...initialPos },
    dir: { ...dir },
    speed,
    spawnTs: Date.now(),
    targetId,
    hitTargets: [],
    hitCount: 0
  };
  
  console.log(`[PROJECTILE] Created new projectile: id=${projectileId}, skill=${skillId}, pos=(${initialPos.x.toFixed(2)}, ${initialPos.z.toFixed(2)}), dir=(${dir.x.toFixed(2)}, ${dir.z.toFixed(2)}), speed=${speed}, targetId=${targetId || 'none'}`);
  
  state.projectiles.push(projectile);
  
  return projectile;
}

/**
 * Handle mana regeneration for all players
 */
function handleManaRegeneration(state: GameState, io: Server) {
  const MANA_REGEN_PER_SECOND = 2;
  
  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (player.isAlive && player.mana < player.maxMana) {
      const oldMana = player.mana;
      // Since this function is called less frequently than the old system,
      // we regenerate more mana per call to achieve the same rate over time
      player.mana = Math.min(player.maxMana, player.mana + MANA_REGEN_PER_SECOND);
      
      // Only broadcast if mana actually changed (avoiding precision issues)
      if (Math.abs(player.mana - oldMana) > 0.01) {
        // Broadcast mana update to all clients
        io.emit('playerUpdated', {
          id: player.id,
          mana: player.mana
        });
      }
    }
  }
}

/**
 * Handle enemy respawns
 */
function handleEnemyRespawns(state: GameState, io: Server) {
  const now = Date.now();

  for (const enemyId in state.enemies) {
    const enemy = state.enemies[enemyId];
    
    if (!enemy.isAlive && enemy.deathTimeTs) {
      const timeSinceDeath = now - enemy.deathTimeTs;
      if (timeSinceDeath >= 30000) { // 30 seconds respawn time
        enemy.isAlive = true;
        enemy.health = enemy.maxHealth;
        enemy.position = { ...enemy.spawnPosition };
        enemy.targetId = null;
        enemy.statusEffects = [];
        
        // Re-add enemy to spatial hash grid upon respawn
        spatial.insert(enemyId, { x: enemy.position.x, z: enemy.position.z });
        
        io.emit('enemyUpdated', enemy);
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
  
  // Implement a cast-lock window to prevent "micro-teleport" exploits
  const now = Date.now();
  if (player.lastUpdateTime && now - player.lastUpdateTime < 33) { // 33ms = ~1 tick at 30 FPS
    console.warn(`Movement request from player ${playerId} received too quickly, enforcing cast-lock window`);
    // Still process the request but apply a slight delay (server-side)
  }
  
  // Validate the target position is within reasonable bounds
  if (!isValidPosition(msg.targetPos)) {
    console.warn(`Invalid target position in MoveIntent from player ${playerId}: ${JSON.stringify(msg.targetPos)}`);
    return;
  }

  // Get current position
  const currentPos = { x: player.position.x, z: player.position.z };
  
  // Calculate the distance to the target
  const distance = Math.sqrt(
    Math.pow(currentPos.x - msg.targetPos.x, 2) +
    Math.pow(currentPos.z - msg.targetPos.z, 2)
  );
  
  // For very small movements (effectively a stop command)
  if (distance < 0.05) {
    // This is a stop command - immediately halt the player
    player.movement = { 
      isMoving: false, 
      lastUpdateTime: now 
    };
    player.velocity = { x: 0, z: 0 };
    
    // Create a position snapshot for the stop command
    const stopSnapMsg = {
      type: 'PosSnap',
      snaps: [{
        id: playerId,
        pos: currentPos,
        vel: { x: 0, z: 0 },
        snapTs: now
      }]
    };
    
    // Send to the requesting client
    socket.emit('msg', stopSnapMsg);
    
    // Also broadcast to other players
    socket.broadcast.emit('msg', stopSnapMsg);
    
    return;
  }
  
  // Calculate direction and determine speed (now server-controlled)
  const dir = calculateDir(currentPos, msg.targetPos);
  
  // Use the target position sent by the client
  const actualTargetPos = msg.targetPos;

  // Determine server-authorized speed (can vary based on player stats, buffs, etc.)
  const speed = getPlayerSpeed(player); // Server decides the speed
  
  // Update player's movement state
  player.movement = {
    ...player.movement,
    isMoving: true,
    targetPos: actualTargetPos, // Use the possibly capped target position
    lastUpdateTime: now,
    speed: speed
  };
  
  // Set velocity for movement simulation
  player.velocity = {
    x: dir.x * speed,
    z: dir.z * speed
  };
  
  // Update last processed time
  player.lastUpdateTime = now;
  
  // Create a position snapshot message
  const posSnapMsg = {
    type: 'PosSnap',
    snaps: [{
      id: playerId, 
      pos: currentPos,
      vel: player.velocity,
      snapTs: now
    }]
  };
  
  // Send position update back to the requesting client
  socket.emit('msg', posSnapMsg);
  
  // Also broadcast to other players
  socket.broadcast.emit('msg', posSnapMsg);
  
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
 * Handles respawn requests from players who have died
 * @param socket The socket of the player requesting respawn
 * @param state The game state
 * @param msg The respawn request message
 * @param io Server instance for broadcasting updates
 */
function onRespawnRequest(socket: Socket, state: GameState, msg: RespawnRequest, io: Server): void {
  const playerId = msg.id;
  const player = state.players[playerId];
  
  if (!player) {
    console.error(`[RespawnRequest] Player ${playerId} not found`);
    return;
  }
  
  // Verify the player is actually dead
  if (player.isAlive) {
    console.warn(`[RespawnRequest] Player ${playerId} is already alive`);
    return;
  }
  
  // Set spawn position (can be customized if you have multiple spawn points)
  const spawnPos = { x: 0, y: 0.5, z: 0 };
  
  // Resurrect player with partial health and mana
  player.isAlive = true;
  player.health = Math.floor(player.maxHealth * 0.5); // 50% health on respawn
  player.mana = Math.floor(player.maxMana * 0.5); // 50% mana on respawn
  player.position = { ...spawnPos };
  player.deathTimeTs = undefined;
  player.velocity = { x: 0, z: 0 };
  
  log(LOG_CATEGORIES.PLAYER, `Player ${player.id} (${player.name}) respawned at ${JSON.stringify(spawnPos)}`);
  
  // Inform all clients about the resurrection
  io.emit('playerUpdated', {
    id: player.id,
    health: player.health,
    mana: player.mana,
    position: player.position,
    isAlive: true,
    deathTimeTs: undefined
  });
  
  // Update spatial grid with new position
  spatial.move(player.id, player.position, player.position); // Force update of position in spatial grid
}

/**
 * Generates loot from an enemy's loot table
 * @param lootTableId The ID of the loot table to use
 * @returns Array of inventory slots containing loot
 */
function generateLoot(lootTableId: string): InventorySlot[] {
  const lootTable = LOOT_TABLES[lootTableId];
  if (!lootTable) {
    log(LOG_CATEGORIES.SYSTEM, `Loot table ${lootTableId} not found`);
    return [];
  }

  const generatedLoot: InventorySlot[] = [];

  // Process each potential drop in the loot table
  lootTable.drops.forEach(drop => {
    // Roll for chance
    const roll = Math.random();
    if (roll <= drop.chance) {
      // Determine quantity
      const quantity = Math.floor(
        drop.quantity.min + Math.random() * (drop.quantity.max - drop.quantity.min + 1)
      );
      
      if (quantity > 0) {
        generatedLoot.push({
          itemId: drop.itemId,
          quantity
        });
      }
    }
  });

  return generatedLoot;
}

/**
 * Adds items to a player's inventory, handling stacking and inventory limits
 * @param player The player to add items to
 * @param items The items to add
 * @returns Object containing successfully added items and overflow items
 */
function addItemsToInventory(
  player: PlayerState, 
  items: InventorySlot[]
): { addedItems: InventorySlot[], overflowItems: InventorySlot[] } {
  const addedItems: InventorySlot[] = [];
  const overflowItems: InventorySlot[] = [];

  // Process each item
  items.forEach(item => {
    let remainingQuantity = item.quantity;
    const { itemId } = item;

    // First try to merge with existing stacks of the same item
    // This requires importing the item definitions to check stackability
    const isStackable = true; // Default to stackable for now
    const maxStack = 999; // Default max stack size
    
    if (isStackable) {
      // Find existing stacks of this item that aren't full
      for (let i = 0; i < player.inventory.length; i++) {
        const slot = player.inventory[i];
        
        if (slot.itemId === itemId && slot.quantity < maxStack && remainingQuantity > 0) {
          // Calculate how much we can add to this stack
          const spaceInStack = maxStack - slot.quantity;
          const amountToAdd = Math.min(spaceInStack, remainingQuantity);
          
          // Add to existing stack
          player.inventory[i].quantity += amountToAdd;
          remainingQuantity -= amountToAdd;
          
          // Add to addedItems for tracking
          addedItems.push({
            itemId,
            quantity: amountToAdd
          });
          
          // If we've added all of this item, break
          if (remainingQuantity <= 0) break;
        }
      }
    }
    
    // If we still have items to add, try to add to a new slot
    if (remainingQuantity > 0) {
      // Check if we have space for a new slot
      if (player.inventory.length < player.maxInventorySlots) {
        // Add to a new slot
        player.inventory.push({
          itemId,
          quantity: remainingQuantity
        });
        
        // Add to addedItems for tracking
        addedItems.push({
          itemId,
          quantity: remainingQuantity
        });
        
        remainingQuantity = 0;
      }
    }
    
    // If we still have items, they go to overflow
    if (remainingQuantity > 0) {
      overflowItems.push({
        itemId,
        quantity: remainingQuantity
      });
    }
  });
  
  return { addedItems, overflowItems };
}
