import { Server, Socket } from 'socket.io';
import { ZoneManager } from '../shared/zoneSystem.js';
import { Enemy, PlayerState } from '../shared/types.js';
import { SkillType, Projectile } from './types.js';
import { isPathBlocked, sweptHit } from './collision.js';
import { ClientMsg, CastReq, VecXZ, PosDelta, LearnSkill, SetSkillShortcut, MoveIntent, RespawnRequest } from '../shared/messages.js';
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
  
  // Current position
  const currentPos = { x: entity.position.x, y: entity.position.y, z: entity.position.z };

  // Get destination and speed
  const dest = entity.movement.targetPos;
  const speed = entity.movement.speed;
  
  // Calculate direction if not already set
  if (!entity.velocity) {
    const dir = calculateDir(currentPos, dest);
    entity.velocity = {
      x: dir.x * speed,
      z: dir.z * speed
    };
  }
  
  // Calculate distance to move this step
  const deltaTimeSec = deltaTimeMs / 1000;
  const stepX = entity.velocity.x * deltaTimeSec;
  const stepY = 0;
  const stepZ = entity.velocity.z * deltaTimeSec;
  const stepDist = Math.sqrt(stepX * stepX + stepY * stepY + stepZ * stepZ);
  // Update position
  const oldPos = { x: entity.position.x, y: entity.position.y, z: entity.position.z };
  entity.position.x += stepX;
  entity.position.y += stepY;
  entity.position.z += stepZ;
  const newPos = { x: entity.position.x, y: entity.position.y, z: entity.position.z };

  // Update spatial hash grid if position changed cells
  if (gridCellChanged(oldPos, newPos)) {
    spatial.move(entity.id, oldPos, newPos);
  }
  
  // Check if we've reached the destination
  const newDist = distance(newPos, dest);
  const prevDist = distance(currentPos, dest);
  
  // If we've passed the destination or are very close, snap to it and clear movement
  if (newDist > prevDist || newDist < 0.1) {
    entity.position.x = dest.x;
    entity.position.z = dest.z;
    
    // Check again if final position changed the cell
    const finalPos = { x: dest.x, z: dest.z };
    if (gridCellChanged(newPos, finalPos)) {
      spatial.move(entity.id, newPos, finalPos);
    }

    entity.movement.targetPos = null;
    entity.velocity = { x: 0, z: 0 };

    // Add a flag to indicate velocity was zeroed so we include it in the next snapshot
    (entity as any).dirtySnap = true;
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
 * Gets the position of an entity at a specific timestamp by interpolating position history
 */
function getPositionAtTime(entity: PlayerState | Enemy, timestamp: number): VecXZ {
  // For enemies or entities without history, just return current position
  if (!('posHistory' in entity) || !entity.posHistory || entity.posHistory.length === 0) {
    return { x: entity.position.x, z: entity.position.z };
  }
  
  const history = entity.posHistory;
  
  // If timestamp is newer than all history entries, use the latest position
  if (timestamp > history[history.length - 1].ts) {
    return { x: entity.position.x, z: entity.position.z };
  }
  
  // If timestamp is older than all history entries, use the oldest position
  if (timestamp < history[0].ts) {
    return { x: history[0].x, z: history[0].z };
  }
  
  // Find the two history entries that bracket the requested timestamp
  let beforeIndex = 0;
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].ts <= timestamp && history[i + 1].ts >= timestamp) {
      beforeIndex = i;
      break;
    }
  }
  
  const before = history[beforeIndex];
  const after = history[beforeIndex + 1];
  
  // Linear interpolation between the two positions
  if (after.ts === before.ts) {
    return { x: before.x, z: before.z }; // Avoid division by zero
  }
  
  const ratio = (timestamp - before.ts) / (after.ts - before.ts);
  return {
    x: before.x + (after.x - before.x) * ratio,
    z: before.z + (after.z - before.z) * ratio
  };
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
 * Note: This returns individual delta messages and PosSnap components, NOT complete messages
 */
function collectDeltas(
    state: GameState,
    timestamp: number,
    playersToForceInclude: Set<string> // New parameter
): (PosDelta | {id: string, pos: VecXZ, vel?: {x: number, z: number}, snapTs: number})[] {
    const msgs: any[] = []; // Use 'any' for simplicity here, ensure correct type on push

    for (const playerId in state.players) {
        const player = state.players[playerId];
        if (!player.isAlive) continue;

        const pos = predictPosition(player, timestamp); // Server's current authoritative pos
        const vel = player.velocity || { x: 0, z: 0 };
        const last = lastSentPos[playerId];

        if (playersToForceInclude.has(playerId) || !last) {
            msgs.push({ id: playerId, pos: pos, vel: vel, snapTs: timestamp });
            lastSentPos[playerId] = { ...pos };
            if ((player as any).dirtySnap) (player as any).dirtySnap = false;
            continue; // Move to next player
        }

        // If not forced, proceed with delta logic
        const dx = Math.round((pos.x - last.x) * CM_PER_UNIT);
        const dz = Math.round((pos.z - last.z) * CM_PER_UNIT);

        // Calculate velocity deltas (optional, can add later if needed)
        // const lastVel = lastVelSent[playerId] || {x:0, z:0};
        // const vdx = Math.round((vel.x - lastVel.x) * CM_PER_UNIT);
        // const vdz = Math.round((vel.z - lastVel.z) * CM_PER_UNIT);

        if (dx === 0 && dz === 0 /* && vdx === 0 && vdz === 0 */) { // If also checking vel deltas
             if ((player as any).dirtySnap) { // Still send if dirty (e.g. stopped, vel changed to 0)
                msgs.push({ id: playerId, pos: pos, vel: vel, snapTs: timestamp });
                lastSentPos[playerId] = { ...pos };
                // lastVelSent[playerId] = {...vel};
                (player as any).dirtySnap = false;
             }
            continue; // No change and not dirty
        }

        if (dx < -POS_MAX_DELTA_CM || dx > POS_MAX_DELTA_CM ||
            dz < -POS_MAX_DELTA_CM || dz > POS_MAX_DELTA_CM
            /* || vdx < -POS_MAX_DELTA_CM || ... */) {
            msgs.push({ id: playerId, pos: pos, vel: vel, snapTs: timestamp });
        } else {
            // Add vel deltas if they are significant or if velocity itself changed
            const deltaMsg: PosDelta = { type: 'PosDelta', id: playerId, dx, dz, serverTs: timestamp };
            // if (vdx !== 0 || vdz !== 0) { // Example: only send vel deltas if they changed
            //    deltaMsg.vdx = vdx;
            //    deltaMsg.vdz = vdz;
            // }
            msgs.push(deltaMsg);
        }
        lastSentPos[playerId] = { ...pos };
        // lastVelSent[playerId] = {...vel};
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
 * Ensures a vector is normalized (unit vector)
 */
function ensureUnitVec(dir: { x: number, z: number }): { x: number, z: number } {
  const magnitude = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
  if (magnitude === 0) return { x: 1, z: 0 }; // Default direction if zero vector
  
  // Normalize the vector
  return {
    x: dir.x / magnitude,
    z: dir.z / magnitude
  };
}

/**
 * Executes a skill's effects
 */
function executeSkillEffects(
  caster: PlayerState, 
  target: Enemy, 
  skillId: SkillType, 
  io: any,
  state: GameState
): void {
  if (!target || !target.isAlive) return;
  
  // Get skill from the shared/skills.ts file if available
  const sharedSkill = SKILLS[skillId as SkillId];
  const skill = SKILLS[skillId as SkillId];
  
  // Launch appropriate effect based on skill category from shared definition if available
  if (sharedSkill) {
    if (sharedSkill.cat === 'projectile') {
      const casterPos = { x: caster.position.x, z: caster.position.z };
      const targetPos = { x: target.position.x, z: target.position.z };
      const dir = calculateDir(casterPos, targetPos);
      
      // Spawn projectile using the effect manager
      effects.spawnProjectile(sharedSkill.id, caster, dir, target.id);
    } else if (sharedSkill.cat === 'instant') {
      // Spawn instant effect using the effect manager
      effects.spawnInstant(sharedSkill.id, caster, [target.id]);
    }
  }
  
  // Handle area of effect damage
  if (skill.area && skill.area > 0) {
    Object.values(state.enemies).forEach(enemy => {
      // Skip primary target (already damaged) and dead enemies
      if (enemy.id === target.id || !enemy.isAlive) return;
      
      // Check if enemy is within AoE radius
      const dist = distance(
        { x: target.position.x, z: target.position.z },
        { x: enemy.position.x, z: enemy.position.z }
      );
      
      if (dist <= skill.area!) {
        // Apply AoE damage
        enemy.health = Math.max(0, enemy.health - (skill.dmg || 0));
        
        // Handle death
        if (enemy.health === 0) {
          enemy.isAlive = false;
          enemy.deathTimeTs = Date.now();
          enemy.targetId = null;
          
          // Remove from spatial hash grid
          spatial.remove(enemy.id, { x: enemy.position.x, z: enemy.position.z });
          
          // Grant experience to the player
          caster.experience += enemy.experienceValue;
        }
        
        // Broadcast enemy update for AoE targets
        io.emit('enemyUpdated', enemy);
      }
    });
  }
  
  // Apply status effect
  if (skill.effects && skill.effects.length > 0) {
    for (const effect of skill.effects) {
      // Skip effects without a duration
      if (!effect.durationMs) continue;
      
      const now = Date.now();
      
      // Use the new effectRunner for direct skill effects
      effectRunner.add(
        target,           // target entity
        caster,           // source entity
        effect.type as any, // effect type as EffectId
        hash(`${skillId}:${target.id}:${now}`) // consistent seed for deterministic effect calculations
      );
    }
  }
  
  // Broadcast updates
  io.emit('enemyUpdated', target);
  io.emit('playerUpdated', caster);
  
  // Emit skillEffect event for visual effects (legacy support)
  // TODO: Remove this legacy skillEffect emission after client PR-3 is merged
  io.emit('skillEffect', {
    skillId,
    sourceId: caster.id,
    targetId: target.id
  });
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

    // Step 1: Advance all entity states
    advanceAll(state, TICK);
    
    // Step 2: Update all effects
    effects.updateAll(TICK/1000); // convert to seconds
    
    // Step 3: Update Enemy AI
    for (const enemyId in state.enemies) {
      const enemy = state.enemies[enemyId];
      if (enemy.isAlive) {
        updateEnemyAI(enemy, state, io, spatial, TICK/1000); // deltaTime is in ms, convert to s
      }
    }
    
    // Step 4: Process active casts using the new skill system
    const world = {
      getEnemyById: (id: string) => state.enemies[id] || null,
      getPlayerById: (id: string) => state.players[id] || null,
      getEntitiesInCircle: (pos: VecXZ, radius: number) => getEntitiesInCircle(state, pos, radius)
    };
    tickCasts(TICK, io, world);
    
    
    
    // Step 4: Update all projectiles
    if (state.projectiles.length > 0) {
      updateProjectiles(state, TICK/1000, io);
    }
    
    // Step 5: Generate and broadcast position updates at the target rate
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
    
    // Step 5: Process mana regeneration (less frequent)
    if (snapAccumulator === 1) {
      handleManaRegeneration(state, io);
    }
    
    // Step 6: Process enemy respawns (even less frequent)
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
        lastUpdateTime: Date.now()
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
          velocity: { x: 0, z: 0 }
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
 * Updates all projectiles in the game
 */
function updateProjectiles(state: GameState, dt: number, io: Server): void {
  const projectilesToRemove: number[] = [];

  const now = Date.now();
  // Process each projectile
  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    
    // Check projectile lifetime - remove if it's too old (10 seconds max lifetime)
    const projectileLifetime = now - p.spawnTs;
    if (projectileLifetime > 10000) {
      log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} removed due to exceeding maximum lifetime (${projectileLifetime}ms)`);
      projectilesToRemove.push(i);
      continue;
    }
    
    // Calculate the total distance traveled since spawn
    const startPos = { 
      x: p.pos.x - p.dir.x * p.speed * (projectileLifetime / 1000),
      z: p.pos.z - p.dir.z * p.speed * (projectileLifetime / 1000)
    };
    const distanceTraveled = Math.sqrt(
      Math.pow(p.pos.x - startPos.x, 2) + 
      Math.pow(p.pos.z - startPos.z, 2)
    );
    
    // Remove projectile if it has traveled too far
    const maxDistance = 100; // Reduced from 5000 to a more reasonable value
    if (distanceTraveled > maxDistance) {
      log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} removed due to exceeding maximum distance (${distanceTraveled.toFixed(2)} > ${maxDistance})`);
      projectilesToRemove.push(i);
      continue;
    }
    
    // Calculate new position using linear movement
    const oldPos = { ...p.pos };
    p.pos.x += p.dir.x * p.speed * dt;
    p.pos.z += p.dir.z * p.speed * dt;
    
    // Debug log for projectile movement
    log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} moved from (${oldPos.x.toFixed(2)}, ${oldPos.z.toFixed(2)}) to (${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)}) with speed ${p.speed}`);
    
    // Check for collisions with players and enemies
    let hit = false;
    const hitTargets: string[] = [];
    
    log(LOG_CATEGORIES.PROJECTILE, `Checking collisions for projectile at (${p.pos.x.toFixed(2)}, ${p.pos.z.toFixed(2)})`);
    
    // Check collision against enemies
    for (const enemyId in state.enemies) {
      const enemy = state.enemies[enemyId];
      if (!enemy.isAlive) continue;
      
      // Skip if this enemy is the caster
      if (enemyId === p.casterId) continue;
      
      // Get enemy position at the time of projectile movement for accurate hit detection
      const timeOfCheck = Date.now();
      const enemyPos = getPositionAtTime(enemy, timeOfCheck);
      
      // Add debug info for distance to enemy
      const distToEnemy = Math.sqrt(
        Math.pow(p.pos.x - enemyPos.x, 2) + 
        Math.pow(p.pos.z - enemyPos.z, 2)
      );
      
      log(LOG_CATEGORIES.PROJECTILE, `Distance to enemy ${enemyId}: ${distToEnemy.toFixed(2)}, enemy pos: (${enemyPos.x.toFixed(2)}, ${enemyPos.z.toFixed(2)})`);
      
      // Get the configured hit radius from the skill definition
      const skill = SKILLS[p.skillId];
      const configuredHitRadius = skill?.projectile?.hitRadius || 1.0;
      
      // Improved hit detection with both distance check and swept hit
      // Uses hit radius from skill config
      const isDirectHit = distToEnemy <= configuredHitRadius * 2.0; // Direct hit can be more generous
      const isSweptHit = sweptHit(oldPos, p.pos, enemyPos, configuredHitRadius);
      
      // Skip this enemy if it's already been hit by this projectile (for piercing projectiles)
      if (p.hitTargets && p.hitTargets.includes(enemyId)) {
        log(LOG_CATEGORIES.PROJECTILE, `Skipping enemy ${enemyId} - already hit by this projectile`);
        continue;
      }
      
      if (isDirectHit || isSweptHit) {
        log(LOG_CATEGORIES.PROJECTILE, `HIT enemy ${enemyId}! Distance: ${distToEnemy.toFixed(2)}, Direct hit: ${isDirectHit}, Swept hit: ${isSweptHit}`);
        hit = true;
        hitTargets.push(enemyId);
        
        // Apply skill effect
        const skill = SKILLS[p.skillId];
        if (skill) {
          // Apply damage to the enemy
          if (skill.dmg) {
            const oldHealth = enemy.health;
            enemy.health -= skill.dmg;
            log(LOG_CATEGORIES.DAMAGE, `Enemy ${enemyId} took ${skill.dmg} damage from projectile ${p.id}. Health: ${oldHealth} -> ${enemy.health}`);
            
            if (enemy.health <= 0) {
              enemy.health = 0;
              enemy.isAlive = false;
              enemy.deathTimeTs = Date.now();
              enemy.targetId = null;
              log(LOG_CATEGORIES.ENEMY, `Enemy ${enemyId} was killed by projectile ${p.id}`);
              
              // Remove enemy from spatial hash grid
              spatial.remove(enemyId, { x: enemy.position.x, z: enemy.position.z });
              
              // Give XP to the player who cast the projectile
              const caster = state.players[p.casterId];
              if (caster) {
                awardPlayerXP(caster, enemy.experienceValue || 0, `killing enemy ${enemyId}`, io);
              }
            }
          }
          
          // Apply status effects if defined
          if (skill.effects && skill.effects.length > 0) {
            for (const effect of skill.effects) {
              // Skip effects without a duration
              if (!effect.durationMs) continue;
              
              const now = Date.now();
              
              // Use the new effectRunner instead of directly pushing to status effects
              effectRunner.add(
                enemy,                  // target entity 
                state.players[p.casterId], // source entity
                effect.type as any,     // effect type as EffectId
                hash(`${p.id}:${enemyId}:${now}`)  // consistent seed for deterministic effect calculations
              );
            }
          }
          
          // Broadcast enemy update
          io.emit('enemyUpdated', enemy);
        }
        
        // Important: Break out of the enemy loop after a hit to ensure we stop checking more enemies
        break;
      }
    }
    
    // Check collision against players (if PvP is enabled)
    for (const playerId in state.players) {
      const player = state.players[playerId];
      if (!player.isAlive) continue;
      
      // Skip if this player is the caster
      if (playerId === p.casterId) continue;
      
      // Get player position at the exact time of projectile movement for more accurate hit detection
      const timeOfCheck = Date.now();
      const playerPos = player.posHistory && player.posHistory.length > 0 
                      ? getPositionAtTime(player, timeOfCheck) 
                      : { x: player.position.x, z: player.position.z };
      
      // Calculate distance to player
      const distToPlayer = Math.sqrt(
        Math.pow(p.pos.x - playerPos.x, 2) + 
        Math.pow(p.pos.z - playerPos.z, 2)
      );
      
      // Get the configured hit radius from the skill definition
      const skill = SKILLS[p.skillId];
      const configuredHitRadius = skill?.projectile?.hitRadius || 0.8; // Default slightly smaller for PvP
      
      // Skip this player if it's already been hit by this projectile (for piercing projectiles)
      if (p.hitTargets && p.hitTargets.includes(playerId)) {
        log(LOG_CATEGORIES.PROJECTILE, `Skipping player ${playerId} - already hit by this projectile`);
        continue;
      }
      
      // Improved hit detection with both distance check and swept hit
      const isDirectHit = distToPlayer <= configuredHitRadius * 1.5; // Direct hit can be more generous
      const isSweptHit = sweptHit(oldPos, p.pos, playerPos, configuredHitRadius);
      
      if (isDirectHit || isSweptHit) {
        log(LOG_CATEGORIES.PROJECTILE, `HIT player ${playerId}! Distance: ${distToPlayer.toFixed(2)}, Direct hit: ${isDirectHit}, Swept hit: ${isSweptHit}`);
        hit = true;
        hitTargets.push(playerId);
        
        // Apply skill effect to player
        // (Add PvP damage logic here if needed)
        
        // Important: Break out of the player loop after a hit
        break;
      }
    }
    
    // Handle hit effects
    if (hit && hitTargets.length > 0) {
      log(LOG_CATEGORIES.PROJECTILE, `Hit detected with ${hitTargets.length} targets, processing hit`);
      
      // Initialize hit targets array if not already present
      if (!p.hitTargets) {
        p.hitTargets = [];
      }
      
      // Track hit count
      p.hitCount = (p.hitCount || 0) + hitTargets.length;
      
      // Add new hit targets to the tracking array
      hitTargets.forEach(targetId => {
        if (!p.hitTargets?.includes(targetId)) {
          p.hitTargets.push(targetId);
        }
      });
      
      // Emit hit event
      io.emit('msg', {
        type: 'ProjHit2',
        castId: p.id,
        hitIds: hitTargets,
        dmg: hitTargets.map(targetId => {
          const { dmg } = getDamage({
            caster: state.players[p.casterId]?.stats ?? {},
            skill: { base: skill?.dmg || 10, variance: 0.1 },
            seed: `${p.id}:${targetId}`
          });
          return dmg;
        }),
        impactPos: { x: p.pos.x, z: p.pos.z }
      });
      
      // Check if the skill has splash damage
      const skill = SKILLS[p.skillId];
      if (skill?.projectile?.splashRadius) {
        const splashRadius = skill.projectile.splashRadius;
        const splashTargets: string[] = [];
        
        // Check all enemies for splash damage
        for (const enemyId in state.enemies) {
          const enemy = state.enemies[enemyId];
          if (!enemy.isAlive || hitTargets.includes(enemyId)) continue; // Skip dead enemies or already hit
          
          // Skip enemies already hit by this projectile
          if (p.hitTargets.includes(enemyId)) {
            continue;
          }
          
          const enemyPos = { x: enemy.position.x, z: enemy.position.z };
          const distToEnemy = Math.sqrt(
            Math.pow(p.pos.x - enemyPos.x, 2) + 
            Math.pow(p.pos.z - enemyPos.z, 2)
          );
          
          if (distToEnemy <= splashRadius) {
            splashTargets.push(enemyId);
            
            // Apply splash damage to the enemy with distance-based fall-off
            if (skill.dmg) {
              // Calculate damage fall-off based on distance
              // 100% damage at direct hit, scaling down to 25% at max splash radius
              const distanceFactor = 1 - (distToEnemy / splashRadius * 0.75);
              const splashDamage = Math.floor(skill.dmg * distanceFactor);
              
              // Track hit
              p.hitTargets.push(enemyId);
              p.hitCount += 1;
              
              const oldHealth = enemy.health;
              enemy.health -= splashDamage;
              log(LOG_CATEGORIES.DAMAGE, `Enemy ${enemyId} took ${splashDamage} splash damage from projectile ${p.id}. Distance: ${distToEnemy.toFixed(2)}, fall-off: ${(distanceFactor * 100).toFixed(0)}%. Health: ${oldHealth} -> ${enemy.health}`);
              
              if (enemy.health <= 0) {
                enemy.health = 0;
                enemy.isAlive = false;
                enemy.deathTimeTs = Date.now();
                enemy.targetId = null;
                log(LOG_CATEGORIES.ENEMY, `Enemy ${enemyId} was killed by splash from projectile ${p.id}`);
                
                // Remove enemy from spatial hash grid
                spatial.remove(enemyId, { x: enemy.position.x, z: enemy.position.z });
                
                // Give XP to the player who cast the projectile
                const caster = state.players[p.casterId];
                if (caster) {
                  awardPlayerXP(caster, enemy.experienceValue || 0, `splash killing enemy ${enemyId}`, io);
                }
              }
              
              // Apply status effects if defined
              if (skill.effects && skill.effects.length > 0) {
                for (const effect of skill.effects) {
                  // Skip effects without a duration
                  if (!effect.durationMs) continue;
                  
                  const effectId = `effect-${hash(`${effect.type}-${Date.now()}-${enemyId}`).toString(36).substring(0, 9)}`;
                  enemy.statusEffects.push({
                    id: effectId,
                    type: effect.type,
                    value: effect.value,
                    durationMs: effect.durationMs,
                    startTimeTs: Date.now(),
                    sourceSkill: p.skillId
                  });
                }
              }
              
              // Broadcast enemy update
              io.emit('enemyUpdated', enemy);
            }
          }
        };
        
        // Emit a separate hit event for splash targets
        if (splashTargets.length > 0) {
          log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} hit ${splashTargets.length} targets with splash damage`);
          io.emit('msg', {
            type: 'ProjHit2',
            castId: p.id,
            hitIds: splashTargets,
            dmg: splashTargets.map(targetId => {
              const { dmg } = getDamage({
                caster: state.players[p.casterId]?.stats ?? {},
                skill: { 
                  base: skill?.dmg || 10, 
                  variance: 0.1 
                },
                seed: `${p.id}:splash:${targetId}`
              });
              return dmg;
            }),
            impactPos: { x: p.pos.x, z: p.pos.z }
          });
        }
      }
      
      // Check for piercing - continue flight if piercing is true
      if (skill?.projectile?.pierce) {
        // Get the max number of hits for this piercing projectile
        const maxPierceHits = skill.projectile.maxPierceHits || Number.MAX_SAFE_INTEGER;
        
        // Check if we've hit the maximum number of targets already
        if (p.hitCount >= maxPierceHits) {
          log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} reached max pierce hits (${p.hitCount}/${maxPierceHits}), removing`);
          
          // Tell clients to despawn it
          io.emit('msg', {
            type: 'ProjHit2',
            castId: p.id,
            hitIds: [],
            dmg: [],
            impactPos: { x: p.pos.x, z: p.pos.z }
          });
          
          // Mark for removal and skip further processing for this projectile
          projectilesToRemove.push(i);
          continue; // Skip the TTL check
        }
        
        log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} has pierce property, continuing flight (hits: ${p.hitCount || 0}/${maxPierceHits})`);
      } else {
        // Also tell clients to despawn it immediately for non-piercing projectiles
        io.emit('msg', {
          type: 'ProjHit2',
          castId: p.id,
          hitIds: [],
          dmg: [],
          impactPos: { x: p.pos.x, z: p.pos.z }
        });
        
        // Mark for removal and skip further processing for this projectile
        projectilesToRemove.push(i);
        continue; // Skip the TTL check
      }
    }
    
    // Check TTL (Time To Live) - 2 seconds max lifetime (reduced from 4)
    if (now - p.spawnTs > 2000) {
      log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} expired by TTL after ${((now - p.spawnTs)/1000).toFixed(1)}s`);
      io.emit('msg', {
        type: 'ProjHit2',
        castId: p.id,
        hitIds: [],
        dmg: [],
        impactPos: { x: p.pos.x, z: p.pos.z }
      });
      
      projectilesToRemove.push(i);
    }
  }
  
  // Remove projectiles that hit or expired (remove from end to start to avoid index issues)
  if (projectilesToRemove.length > 0) {
    log(LOG_CATEGORIES.PROJECTILE, `Removing ${projectilesToRemove.length} projectiles`);
    for (let i = projectilesToRemove.length - 1; i >= 0; i--) {
      const index = projectilesToRemove[i];
      const p = state.projectiles[index];
      log(LOG_CATEGORIES.PROJECTILE, `Projectile ${p.id} removed from world`);
      state.projectiles.splice(index, 1);
    }
  }
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
        if (Math.random() < 0.1) { // Reduce log spam
             console.log(`Broadcasting BatchUpdate with ${snapItems.length} items. Forced: ${playersToForceInclude.size}`);
        }
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
  
  // Limit maximum teleport distance - if move request is too far, cap it
  let targetPos = { ...msg.targetPos };

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
  
  // Use the already defined MAX_MOVE_DISTANCE for capping move distances
  let actualTargetPos = { ...msg.targetPos };
  
    actualTargetPos = msg.targetPos;

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
