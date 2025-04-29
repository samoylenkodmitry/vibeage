import { Server, Socket } from 'socket.io';
import { ZoneManager } from '../shared/zoneSystem.js';
import { Enemy, StatusEffect } from '../shared/types.js';
import { SkillType } from './types.js';
import { SKILLS_LEGACY } from './skillsAdapter.js';
import { isPathBlocked, findValidDestination } from './collision.js';
import { ClientMsg, MoveStart, MoveSync, CastReq, VecXZ, PosSnap, PlayerMovementState } from '../shared/messages.js';
import { EffectManager } from './effects/manager';
import { SKILLS, SkillId } from '../shared/skillsDefinition.js';

/**
 * Defines the GameState interface
 */
interface GameState {
  players: Record<string, PlayerState>;
  enemies: Record<string, Enemy>;
}

interface PlayerState {
  id: string;
  socketId: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  skills: SkillType[];
  skillCooldownEndTs: Record<string, number>;
  statusEffects: StatusEffect[];
  level: number;
  experience: number;
  experienceToNextLevel: number;
  castingSkill: SkillType | null;
  castingProgressMs: number;
  isAlive: boolean;
  deathTimeTs?: number;
  lastUpdateTime?: number;
  movement?: PlayerMovementState;
  velocity?: { x: number; z: number }; // New: current velocity vector
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
  entity: { position: { x: number; z: number }, movement?: { dest: VecXZ | null, speed: number, startTs: number } },
  timestamp: number
): VecXZ {
  if (!entity.movement?.dest) {
    return { x: entity.position.x, z: entity.position.z };
  }

  const dest = entity.movement.dest;
  const speed = entity.movement.speed;
  const startTs = entity.movement.startTs;
  const currentPos = { x: entity.position.x, z: entity.position.z };
  
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
  if (!entity.movement?.dest) return;
  
  // Current position
  const currentPos = { x: entity.position.x, z: entity.position.z };
  
  // Get destination and speed
  const dest = entity.movement.dest;
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
  const stepZ = entity.velocity.z * deltaTimeSec;
  
  // Update position
  entity.position.x += stepX;
  entity.position.z += stepZ;
  
  // Check if we've reached the destination
  const newDist = distance({ x: entity.position.x, z: entity.position.z }, dest);
  const prevDist = distance(currentPos, dest);
  
  // If we've passed the destination or are very close, snap to it and clear movement
  if (newDist > prevDist || newDist < 0.1) {
    entity.position.x = dest.x;
    entity.position.z = dest.z;
    entity.movement.dest = null;
    entity.velocity = { x: 0, z: 0 };
    
    // Add a flag to indicate velocity was zeroed so we include it in the next snapshot
    (entity as any).dirtySnap = true;
  }
}

/**
 * Advances all entities in the game world by the given time step
 */
function advanceAll(state: GameState, deltaTimeMs: number): void {
  // Process player movements
  for (const playerId in state.players) {
    const player = state.players[playerId];
    if (player.movement?.dest) {
      advancePosition(player, deltaTimeMs);
    }
  }
  
  // Process enemy logic, status effects, etc.
  for (const enemyId in state.enemies) {
    const enemy = state.enemies[enemyId];
    
    // Process enemy targeting and movement here
    if (enemy.isAlive && enemy.targetId) {
      const target = state.players[enemy.targetId];
      if (target && target.isAlive) {
        // Calculate target position prediction
        const targetPos = predictPosition(target, Date.now());
        
        // Movement logic for enemy to follow target
        // (Simplified for now)
      }
    }
    
    // Process status effects (could be moved to a separate function)
    if (enemy.statusEffects.length > 0) {
      const now = Date.now();
      enemy.statusEffects = enemy.statusEffects.filter(effect => {
        return (effect.startTimeTs + effect.durationMs) > now;
      });
    }
  }
}

/**
 * Collects current position snapshots for all entities
 */
function collectSnaps(state: GameState, timestamp: number): PosSnap[] {
  const snaps: PosSnap[] = [];
  
  // Add player position snapshots
  for (const playerId in state.players) {
    const player = state.players[playerId];
    
    // Skip dead players
    if (!player.isAlive) continue;
    
    // Get predicted/current position
    const pos = predictPosition(player, timestamp);
    
    // Add velocity if moving, zero otherwise
    const vel = player.velocity || { x: 0, z: 0 };
    
    // Always include in snapshot if player has dirty velocity flag
    // or if player is moving (non-zero velocity)
    const shouldInclude = (player as any).dirtySnap || 
                         (vel.x !== 0 || vel.z !== 0) || 
                         player.movement?.dest !== null;
    
    if (shouldInclude) {
      snaps.push({
        id: playerId,
        pos,
        vel,
        ts: timestamp
      });
      
      // Clear the dirty flag after including in snapshot
      if ((player as any).dirtySnap) {
        (player as any).dirtySnap = false;
      }
    }
  }
  
  return snaps;
}

/**
 * Validates movement start requests
 */
function validateMoveStart(player: PlayerState, msg: MoveStart): boolean {
  // Validate player speed
  const MAX_SPEED = 30; // units per second
  if (msg.speed > MAX_SPEED) {
    console.warn(`Player ${player.id} attempted to move too fast: ${msg.speed} > ${MAX_SPEED}`);
    return false;
  }
  
  // Validate movement while dead
  if (!player.isAlive) {
    console.warn(`Dead player ${player.id} attempted to move`);
    return false;
  }
  
  // Wall/collision validation for the first path segment
  if (msg.path.length > 0) {
    const startPos = { x: player.position.x, z: player.position.z };
    const firstDest = msg.path[0];
    
    if (isPathBlocked(startPos, firstDest)) {
      console.warn(`Player ${player.id} attempted to move through an obstacle`);
      return false;
    }
  }
  
  return true;
}

/**
 * Handles MoveStart message
 */
function onMoveStart(socket: Socket, state: GameState, msg: MoveStart): void {
  const playerId = msg.id;
  const player = state.players[playerId];
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    console.warn(`Invalid player ID or wrong socket for MoveStart: ${playerId}`);
    return;
  }
  
  // Validate the move request
  if (!validateMoveStart(player, msg)) {
    return;
  }
  
  // Determine destination from the path
  const destination = msg.path.length > 0 ? msg.path[0] : null;
  if (!destination) {
    console.warn(`Empty path in MoveStart from player ${playerId}`);
    return;
  }

  // Calculate direction and velocity
  const dir = calculateDir({ x: player.position.x, z: player.position.z }, destination);
  
  // Update player's movement state
  player.movement = {
    dest: destination,
    speed: msg.speed,
    startTs: Date.now()
  };
  
  // Set the velocity vector
  player.velocity = {
    x: dir.x * msg.speed,
    z: dir.z * msg.speed
  };
  
  // Instead of using socket.server.emit, we'll broadcast the message to all clients
  // We can use socket.broadcast.emit to send to all clients except the sender
  // or just use the io instance that's passed to the createWorld function
  socket.broadcast.emit('msg', msg);
}

/**
 * Handles MoveSync message
 */
function onMoveSync(socket: Socket, state: GameState, msg: MoveSync): void {
  const playerId = msg.id;
  const player = state.players[playerId];
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    return;
  }
  
  // Calculate the current server-side position
  const serverPos = predictPosition(player, Date.now());
  
  // Calculate error between client and server positions
  const error = distance(serverPos, msg.pos);
  
  // If error is large, force correction
  if (error > 2.0) {
    console.warn(`Large position error for player ${playerId}: ${error} units. Correction applied.`);
    
    // Send a position snapshot to correct the client
    socket.emit('msg', {
      type: 'PosSnap',
      snaps: [{
        id: playerId,
        pos: serverPos,
        vel: player.velocity || { x: 0, z: 0 },
        snapTs: Date.now()
      }]
    });
  } 
  // For smaller errors, we could implement gradual reconciliation if needed
}

/**
 * Handles CastReq message
 */
function onCastReq(socket: Socket, state: GameState, msg: CastReq): void {
  const playerId = msg.id;
  const player = state.players[playerId];
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    return;
  }
  
  // Validate skill exists
  if (!player.skills.includes(msg.skillId as SkillType)) {
    console.warn(`Player ${playerId} tried to cast unknown skill: ${msg.skillId}`);
    return;
  }
  
  const skill = SKILLS_LEGACY[msg.skillId as SkillType];
  if (!skill) {
    console.warn(`Invalid skill ID: ${msg.skillId}`);
    return;
  }
  
  // Check mana cost
  if (player.mana < skill.manaCost) {
    console.warn(`Not enough mana: ${player.mana} < ${skill.manaCost}`);
    return;
  }
  
  // Check cooldown
  const cooldownEnd = player.skillCooldownEndTs[msg.skillId] || 0;
  const now = Date.now();
  if (now < cooldownEnd) {
    console.warn(`Skill on cooldown: ${msg.skillId}, ${(cooldownEnd - now) / 1000}s remaining`);
    return;
  }
  
  // If targeting an enemy, validate target
  if (msg.targetId) {
    const target = state.enemies[msg.targetId];
    if (!target || !target.isAlive) {
      console.warn(`Invalid target for skill: ${msg.targetId}`);
      return;
    }
    
    // Use predictPosition for accurate range check
    const casterPos = predictPosition(player, now);
    const targetPos = { x: target.position.x, z: target.position.z };
    const dist = distance(casterPos, targetPos);
    
    // Check skill range - use skill's defined range
    if (dist > skill.range) {
      console.warn(`Target out of range: ${dist} > ${skill.range}`);
      return;
    }
  }
  
  // Apply mana cost and set cooldown
  player.mana -= skill.manaCost;
  player.skillCooldownEndTs[msg.skillId] = now + skill.cooldownMs;
  
  // Get the io server instance from socket's connection
  const io = socket.nsp;
  
  // Broadcast cast start
  io.emit('msg', {
    type: 'CastStart',
    id: playerId,
    skillId: msg.skillId,
    castMs: skill.castTimeMs
  });
  
  // Schedule cast completion
  setTimeout(() => {
    // Execute skill effect after cast time
    if (msg.targetId) {
      const target = state.enemies[msg.targetId];
      if (target) {
        executeSkillEffects(player, target, msg.skillId as SkillType, io, state);
      }
    }
    
    // Broadcast cast completion
    io.emit('msg', {
      type: 'CastEnd',
      id: playerId,
      skillId: msg.skillId,
      success: true
    });
  }, skill.castTimeMs);
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
  
  const skill = SKILLS_LEGACY[skillId];
  if (!skill) return;
  
  // Get skill from the shared/skills.ts file if available
  const sharedSkill = SKILLS[skillId as SkillId];
  
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
  
  // Apply damage to primary target (legacy code)
  if (skill.damage) {
    const oldHealth = target.health;
    target.health = Math.max(0, target.health - skill.damage);
    
    if (target.health === 0) {
      target.isAlive = false;
      target.deathTimeTs = Date.now();
      target.targetId = null;
      
      // Grant experience to the player
      caster.experience += target.experienceValue;
      
      // Check for level up
      while (caster.experience >= caster.experienceToNextLevel) {
        caster.level++;
        caster.experience -= caster.experienceToNextLevel;
        caster.experienceToNextLevel = Math.floor(caster.experienceToNextLevel * 1.5);
        caster.maxHealth += 20;
        caster.health = caster.maxHealth;
        caster.maxMana += 10;
        caster.mana = caster.maxMana;
      }
    }
  }
  
  // Handle area of effect damage
  if (skill.areaOfEffect && skill.areaOfEffect > 0) {
    Object.values(state.enemies).forEach(enemy => {
      // Skip primary target (already damaged) and dead enemies
      if (enemy.id === target.id || !enemy.isAlive) return;
      
      // Check if enemy is within AoE radius
      const dist = distance(
        { x: target.position.x, z: target.position.z },
        { x: enemy.position.x, z: enemy.position.z }
      );
      
      if (dist <= skill.areaOfEffect!) {
        // Apply AoE damage
        enemy.health = Math.max(0, enemy.health - skill.damage);
        
        // Handle death
        if (enemy.health === 0) {
          enemy.isAlive = false;
          enemy.deathTimeTs = Date.now();
          enemy.targetId = null;
          
          // Grant experience to the player
          caster.experience += enemy.experienceValue;
        }
        
        // Broadcast enemy update for AoE targets
        io.emit('enemyUpdated', enemy);
      }
    });
  }
  
  // Apply status effect
  if (skill.statusEffect) {
    const effectId = Math.random().toString(36).substr(2, 9);
    target.statusEffects.push({
      id: effectId,
      ...skill.statusEffect,
      startTimeTs: Date.now(),
      sourceSkill: skillId
    });
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

export function initWorld(io: Server, zoneManager: ZoneManager) {
  // Initialize game state
  const state: GameState = {
    players: {},
    enemies: {}
  };
  
  // Initialize effect manager
  effects = new EffectManager(io, state);
  
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
    
    // Step 3: Generate and broadcast PosSnap at the target rate
    snapAccumulator += 1;
    if (snapAccumulator >= 30 / SNAP_HZ) {
      const snaps = collectSnaps(state, now);
      if (snaps.length > 0) {
        io.emit('msg', {
          type: 'PosSnap',
          snaps
        });
      }
      snapAccumulator = 0;
    }
    
    // Step 4: Process mana regeneration (less frequent)
    if (snapAccumulator === 1) {
      handleManaRegeneration(state, io);
    }
    
    // Step 5: Process enemy respawns (even less frequent)
    if (snapAccumulator === 2) {
      handleEnemyRespawns(state, io);
    }
  }, TICK);
  
  // Return public API
  return {
    handleMessage(socket: Socket, msg: ClientMsg) {
      switch (msg.type) {
        case 'MoveStart': return onMoveStart(socket, state, msg);
        case 'MoveSync': return onMoveSync(socket, state, msg);
        case 'CastReq': return onCastReq(socket, state, msg);
      }
    },
    
    getGameState() {
      return state;
    },
    
    addPlayer(socketId: string, name: string) {
      const playerId = Math.random().toString(36).substr(2, 9);
      
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
        level: 1,
        experience: 0,
        experienceToNextLevel: 100,
        statusEffects: [],
        skillCooldownEndTs: {},
        castingSkill: null,
        castingProgressMs: 0,
        isAlive: true,
        movement: { dest: null, speed: 0, startTs: 0 },
        velocity: { x: 0, z: 0 },
        skills: ['fireball', 'iceBolt', 'waterSplash', 'petrify']
      };
      
      state.players[playerId] = player;
      return player;
    },
    
    removePlayerBySocketId(socketId: string) {
      const playerId = Object.keys(state.players).find(
        id => state.players[id].socketId === socketId
      );
      
      if (playerId) {
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

        const enemyId = `${type}-${Math.random().toString(36).substr(2, 9)}`;
        const level = zoneManager.getMobLevel(zone.id);

        state.enemies[enemyId] = {
          id: enemyId,
          type,
          name: type.charAt(0).toUpperCase() + type.slice(1),
          level,
          position,
          spawnPosition: { ...position },
          rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
          health: 100 + (level * 20),
          maxHealth: 100 + (level * 20),
          isAlive: true,
          attackDamage: 10 + (level * 2),
          attackRange: 2,
          baseExperienceValue: 50 + (level * 10),
          experienceValue: 50 + (level * 10),
          statusEffects: [],
          targetId: null,
        };
      }
    });
  });
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
        io.emit('enemyUpdated', enemy);
      }
    }
  }
}
