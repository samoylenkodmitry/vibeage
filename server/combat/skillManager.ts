// filepath: /home/s/develop/projects/vibe/1/server/combat/skillManager.ts
import { Socket, Server } from 'socket.io';
import { SKILLS, SkillId } from '../../shared/skillsDefinition.js';
import { CastReq, CastStart, CastFail, CastSnapshotMsg, ProjSpawn2, ProjHit2 } from '../../shared/messages.js';
import { getManaCost, getCooldownMs } from '../../shared/combatMath.js';
import { VecXZ } from '../../shared/messages.js';
import { predictPosition, distance } from '../../shared/positionUtils.js';
import { CastState as CastStateEnum, CastSnapshot } from '../../shared/types.js';
import { nanoid } from 'nanoid';

/**
 * Calculate damage for a skill based on the skill and caster stats
 * @param skill The skill object with dmg property
 * @param casterStats Optional caster stats that may modify damage
 * @returns The calculated damage amount
 */
function getDamage(skill: any, casterStats?: any): number {
  // Base damage from skill
  let damage = skill.dmg || 10;
  
  // Apply caster stats if available
  if (casterStats && casterStats.damageMultiplier) {
    damage *= casterStats.damageMultiplier;
  }
  
  // Add some variation
  const variation = 0.9 + Math.random() * 0.2; // 90% to 110% of base damage
  damage *= variation;
  
  return Math.floor(damage);
}

/**
 * Get world interface for interacting with game state
 */
interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => Player | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => any[];
}

// Define the type for active casts (legacy)
interface CastState {
  id: string;
  skillId: SkillId;
  startTime: number;
  castTimeMs: number;
  targetId?: string;
  targetPos?: VecXZ;
  clientSeq: number; // To reconcile with client
  state: 'casting' | 'completed' | 'canceled';
}

// New types for the enhanced Cast and Projectile system
interface Cast {
  castId: string;
  casterId: string;
  skillId: SkillId;
  state: CastStateEnum;
  origin: VecXZ;
  target?: VecXZ;
  startedAt: number;
  castTimeMs: number;
  targetId?: string;
  targetPos?: VecXZ;
}

interface Projectile {
  castId: string;
  pos: VecXZ;
  dir: VecXZ;
  speed: number;
  distanceTraveled: number;
  maxRange: number;
  startTime: number;
  skillId: SkillId;
}

// Player interface that contains needed properties for skill casting
interface Player {
  id: string;
  socketId: string;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  cooldowns: Record<string, number>;
  skillCooldownEndTs: Record<string, number>;
  isAlive: boolean;
  level: number;
  position: { x: number; y: number; z: number };
  movement?: any;
  stats?: any;
  // Other player properties
}

// Collection of active casts by all players (legacy)
const activeCasts: CastState[] = [];
// Collection of completed casts to be processed
let completedCasts: CastState[] = [];

// New collections for the enhanced system
const activeCastsNew: Cast[] = [];
const projectiles: Projectile[] = [];

/**
 * Handle a cast request from a client
 * Validates mana and cooldown, creates cast state or rejects with fail message
 */
export function handleCastReq(
  player: Player,
  req: CastReq,
  socket: Socket,
  getEnemyById: (id: string) => any | null
): void {
  const now = Date.now();
  const skillId = req.skillId as SkillId;
  const skill = SKILLS[skillId];
  
  // Make sure the skill exists
  if (!skill) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: req.clientTs, // Use clientTs as clientSeq for reconciliation
      reason: 'invalid'
    } as CastFail);
    return;
  }
  
  // Check if player is alive
  if (!player.isAlive) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: req.clientTs,
      reason: 'invalid'
    } as CastFail);
    return;
  }
  
  // Check cooldown
  if ((player.cooldowns?.[skillId] && now < player.cooldowns[skillId]) || 
      (player.skillCooldownEndTs?.[skillId] && now < player.skillCooldownEndTs[skillId])) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: req.clientTs,
      reason: 'cooldown'
    } as CastFail);
    return;
  }
  
  // Check mana cost
  const manaCost = getManaCost(skillId, player.level);
  if (player.mana < manaCost) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: req.clientTs,
      reason: 'nomana'
    } as CastFail);
    return;
  }
  
  // Check range if this is a targeted ability
  if (skill.range && req.targetId) {
    const target = getEnemyById(req.targetId);
    if (!target) {
      socket.emit('msg', {
        type: 'CastFail',
        clientSeq: req.clientTs,
        reason: 'invalid'
      } as CastFail);
      return;
    }
    
    // Check if target is alive
    if (!target.isAlive) {
      socket.emit('msg', {
        type: 'CastFail',
        clientSeq: req.clientTs,
        reason: 'invalid'
      } as CastFail);
      return;
    }
    
    // Check range
    const playerPos = predictPosition(player, now);
    const targetPos = { x: target.position.x, z: target.position.z };
    
    if (distance(playerPos, targetPos) > skill.range) {
      socket.emit('msg', {
        type: 'CastFail',
        clientSeq: req.clientTs,
        reason: 'invalid'
      } as CastFail);
      return;
    }
  } else if (skill.range && req.targetPos) {
    // Position-targeted ability
    const playerPos = predictPosition(player, now);
    
    if (distance(playerPos, req.targetPos) > skill.range) {
      socket.emit('msg', {
        type: 'CastFail',
        clientSeq: req.clientTs,
        reason: 'invalid'
      } as CastFail);
      return;
    }
  }
  
  // Deduct mana
  player.mana -= manaCost;
  
  // Set cooldown
  const cooldownMs = getCooldownMs(skillId, player.level);
  player.cooldowns[skillId] = now + cooldownMs;
  player.skillCooldownEndTs[skillId] = now + cooldownMs;
  
  // Create a cast state entry
  const cast: CastState = {
    id: player.id,
    skillId,
    startTime: now,
    castTimeMs: skill.castMs, // Use castMs from skill definition
    targetId: req.targetId,
    targetPos: req.targetPos,
    clientSeq: req.clientTs,
    state: 'casting'
  };
  
  // Add to active casts
  activeCasts.push(cast);
  
  // Emit cast start event
  const castStartMessage: CastStart = {
    type: 'CastStart',
    id: player.id,
    skillId,
    castTimeMs: skill.castMs,
    targetId: req.targetId,
    targetPos: req.targetPos,
    serverTs: now
  };
  
  // Send to everyone including the caster
  socket.emit('msg', castStartMessage);
  socket.broadcast.emit('msg', castStartMessage);
  
  // Create a new Cast object for the enhanced system
  const newCast: Cast = {
    castId: nanoid(),
    casterId: player.id,
    skillId,
    state: CastStateEnum.Casting,
    origin: { x: player.position.x, z: player.position.z },
    startedAt: now,
    castTimeMs: skill.castMs,
    targetId: req.targetId,
    targetPos: req.targetPos
  };
  
  // Add to active casts
  activeCastsNew.push(newCast);
  
  // Broadcast initial cast snapshot
  const castSnapshot: CastSnapshot = {
    castId: newCast.castId,
    casterId: newCast.casterId,
    skillId: newCast.skillId,
    state: newCast.state,
    origin: newCast.origin,
    target: newCast.targetPos,
    startedAt: newCast.startedAt
  };
  
  socket.emit('msg', {
    type: 'CastSnapshot',
    data: castSnapshot
  } as CastSnapshotMsg);
  socket.broadcast.emit('msg', {
    type: 'CastSnapshot',
    data: castSnapshot
  } as CastSnapshotMsg);
}

/**
 * Update casting progress for all active casts
 * Should be called from game loop on regular intervals
 */
export function updateCasts(io?: Server, players?: Record<string, any>): void {
  const now = Date.now();
  const localCompletedCasts: CastState[] = [];
  const playerUpdates: Record<string, any> = {};
  
  // Update all active casts
  for (let i = activeCasts.length - 1; i >= 0; i--) {
    const cast = activeCasts[i];
    const elapsedMs = now - cast.startTime;
    
    // Update casting progress for this player
    if (players && players[cast.id]) {
      players[cast.id].castingProgressMs = elapsedMs;
    }
    
    if (!playerUpdates[cast.id]) {
      playerUpdates[cast.id] = { id: cast.id, castingProgressMs: elapsedMs };
    }
    
    // Check if cast is complete
    if (elapsedMs >= cast.castTimeMs) {
      // Mark as completed
      cast.state = 'completed';
      localCompletedCasts.push({...cast});
      
      // Add to the global completed casts array
      completedCasts.push({...cast});
      
      // Remove from active casts
      activeCasts.splice(i, 1);
      
      // Reset player's casting state
      if (players && players[cast.id]) {
        players[cast.id].castingSkill = null;
        players[cast.id].castingProgressMs = 0;
      }
      
      // Update completion status
      if (playerUpdates[cast.id]) {
        playerUpdates[cast.id].castingProgressMs = 0; // Reset to 0
        playerUpdates[cast.id].castingSkill = null;   // Reset casting skill
      }
      
      // Send cast end message
      if (io) {
        io.emit('msg', {
          type: 'CastEnd',
          id: cast.id,
          skillId: cast.skillId,
          success: true,
          serverTs: now
        });
      }
    }
  }
  
  // Send progress updates to clients if we have the io server
  if (io && Object.keys(playerUpdates).length > 0) {
    // Send progress updates to all clients
    for (const playerId in playerUpdates) {
      io.emit('playerUpdated', playerUpdates[playerId]);
    }
  }
}

/**
 * Process the effects of a completed cast
 */
function processCompletedCast(cast: CastState): void {
  // This would handle the actual skill execution
  // - For projectiles, spawn new projectile entities
  // - For direct damage skills, apply damage immediately
  // - For status effects, apply them to targets
  
  // This is handled by separate game systems
  console.log(`Cast completed: ${cast.skillId} by player ${cast.id}`);
}

/**
 * Gets and clears the completed casts queue
 * Other systems should call this to process completed casts
 */
export function getCompletedCasts(): CastState[] {
  const casts = [...completedCasts];
  completedCasts.length = 0; // Clear the array
  return casts;
}

/**
 * Cancel an active cast
 */
export function cancelCast(playerId: string, skillId?: string): boolean {
  const index = activeCasts.findIndex(cast => 
    cast.id === playerId && 
    (skillId ? cast.skillId === skillId : true)
  );
  
  if (index >= 0) {
    const cast = activeCasts[index];
    cast.state = 'canceled';
    activeCasts.splice(index, 1);
    return true;
  }
  
  return false;
}

/**
 * Check if a player is currently casting
 */
export function isPlayerCasting(playerId: string): boolean {
  return activeCasts.some(cast => cast.id === playerId);
}

/**
 * Updates and progresses active casts, transitions them between states
 */
export function tickCasts(dt: number, io: Server, world: World): void {
  const now = Date.now();
  
  for (let i = activeCastsNew.length - 1; i >= 0; i--) {
    const cast = activeCastsNew[i];
    
    // Skip casts that are already in their final state
    if (cast.state === CastStateEnum.Impact) {
      // Remove completed casts after a delay
      if (now - cast.startedAt > 5000) { // 5 seconds after cast started
        activeCastsNew.splice(i, 1);
      }
      continue;
    }
    
    // Check if cast time is complete for casts in Casting state
    if (cast.state === CastStateEnum.Casting) {
      const elapsedMs = now - cast.startedAt;
      
      if (elapsedMs >= cast.castTimeMs) {
        // Cast is complete, transition to Traveling or Impact
        const skill = SKILLS[cast.skillId];
        const isProjectileSkill = skill.projectile !== undefined;
        
        if (isProjectileSkill) {
          // Change state to Traveling
          cast.state = CastStateEnum.Traveling;
          
          // Calculate direction vector
          let dir = { x: 0, z: 0 };
          
          if (cast.targetPos) {
            // Targeted at a position
            const dx = cast.targetPos.x - cast.origin.x;
            const dz = cast.targetPos.z - cast.origin.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            // Normalize the direction
            if (dist > 0) {
              dir = {
                x: dx / dist,
                z: dz / dist
              };
            }
          } else if (cast.targetId) {
            // Targeted at an entity
            const target = world.getEnemyById(cast.targetId);
            if (target) {
              const targetPos = { x: target.position.x, z: target.position.z };
              const dx = targetPos.x - cast.origin.x;
              const dz = targetPos.z - cast.origin.z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              
              // Normalize the direction
              if (dist > 0) {
                dir = {
                  x: dx / dist,
                  z: dz / dist
                };
              }
            }
          }
          
          // Create projectile
          const projectile: Projectile = {
            castId: cast.castId,
            pos: { ...cast.origin },
            dir,
            speed: skill.projectile?.speed || 5,
            distanceTraveled: 0,
            maxRange: skill.range || 10,
            startTime: now,
            skillId: cast.skillId
          };
          
          projectiles.push(projectile);
          
          // Emit projectile spawn
          io.emit('msg', {
            type: 'ProjSpawn2',
            castId: cast.castId,
            origin: cast.origin,
            dir,
            speed: projectile.speed,
            launchTs: now,
            hitRadius: skill.projectile?.hitRadius
          } as ProjSpawn2);
          
          // Broadcast cast state change
          io.emit('msg', {
            type: 'CastSnapshot',
            data: {
              castId: cast.castId,
              casterId: cast.casterId,
              skillId: cast.skillId,
              state: cast.state,
              origin: cast.origin,
              target: cast.targetPos,
              startedAt: cast.startedAt
            }
          } as CastSnapshotMsg);
        } else {
          // Instant cast, goes straight to Impact
          cast.state = CastStateEnum.Impact;
          
          // Broadcast cast state change
          io.emit('msg', {
            type: 'CastSnapshot',
            data: {
              castId: cast.castId,
              casterId: cast.casterId,
              skillId: cast.skillId,
              state: cast.state,
              origin: cast.origin,
              target: cast.targetPos,
              startedAt: cast.startedAt
            }
          } as CastSnapshotMsg);
          
          // TODO: Handle instant cast effects directly here
        }
      }
    }
  }
}

/**
 * Updates projectile positions and handles collisions
 */
export function tickProjectiles(dt: number, io: Server, world: World): void {
  const now = Date.now();
  
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    const skill = SKILLS[proj.skillId];
    
    // Calculate distance traveled in this time step
    const distanceThisFrame = proj.speed * (dt / 1000);
    proj.distanceTraveled += distanceThisFrame;
    
    // Update position
    proj.pos.x += proj.dir.x * distanceThisFrame;
    proj.pos.z += proj.dir.z * distanceThisFrame;
    
    // Check if projectile has reached max range
    let detonate = false;
    if (proj.distanceTraveled >= proj.maxRange) {
      detonate = true;
      
      // Find the matching cast to update state
      const castIndex = activeCastsNew.findIndex(c => c.castId === proj.castId);
      if (castIndex >= 0) {
        const cast = activeCastsNew[castIndex];
        
        // Update cast state to Impact
        cast.state = CastStateEnum.Impact;
        
        // Emit hit message with empty hit list
        io.emit('msg', {
          type: 'ProjHit2',
          castId: proj.castId,
          hitIds: [],
          dmg: [],
          impactPos: { ...proj.pos }  // Include impact position for VFX
        } as ProjHit2);
        
        // Broadcast cast state change
        io.emit('msg', {
          type: 'CastSnapshot',
          data: {
            castId: cast.castId,
            casterId: cast.casterId,
            skillId: cast.skillId,
            state: cast.state,
            origin: cast.origin,
            target: cast.targetPos,
            startedAt: cast.startedAt
          }
        } as CastSnapshotMsg);
      }
    }
    
    // Check for collisions
    if (skill.projectile?.hitRadius) {
      const victims = world.getEntitiesInCircle(proj.pos, skill.projectile.hitRadius);
      
      if (victims.length > 0) {
        detonate = true;
        
        // Find the matching cast
        const castIndex = activeCastsNew.findIndex(c => c.castId === proj.castId);
        if (castIndex >= 0) {
          const cast = activeCastsNew[castIndex];
          const caster = world.getPlayerById(cast.casterId);
          
          // Calculate damage for each victim
          const dmgArr = victims.map((v: any) => getDamage(skill, caster?.stats));
          
          // Emit hit message with current projectile data
          const currentProj = projectiles[i];
          const hitVictims = victims;

          io.emit('msg', {
            type: 'ProjHit2',
            castId: currentProj.castId,
            hitIds: hitVictims.map((v: any) => v.id),
            dmg: dmgArr,
            impactPos: { ...currentProj.pos }  // Include impact position for VFX
          } as ProjHit2);
          
          // Update cast state to Impact
          cast.state = CastStateEnum.Impact;
          
          // Broadcast cast snapshot
          io.emit('msg', {
            type: 'CastSnapshot',
            data: {
              castId: cast.castId,
              casterId: cast.casterId,
              skillId: cast.skillId,
              state: cast.state,
              origin: cast.origin,
              target: cast.targetPos,
              startedAt: cast.startedAt
            }
          } as CastSnapshotMsg);
        }
      }
    }
    
    // If projectile should detonate (hit max range or collided), remove it
    if (detonate) {
      projectiles.splice(i, 1);
    }
  }
}

/**
 * Send snapshots of all active casts and projectiles to a client
 * Call this when a new client connects to catch them up on the game state
 */
export function sendCastSnapshots(socket: Socket): void {
  // Send all active casts
  activeCastsNew.forEach(cast => {
    socket.emit('msg', {
      type: 'CastSnapshot',
      data: {
        castId: cast.castId,
        casterId: cast.casterId,
        skillId: cast.skillId,
        state: cast.state,
        origin: cast.origin,
        target: cast.targetPos,
        startedAt: cast.startedAt
      }
    } as CastSnapshotMsg);
  });
  
  // Send all active projectiles
  projectiles.forEach(proj => {
    socket.emit('msg', {
      type: 'ProjSpawn2',
      castId: proj.castId,
      origin: proj.pos,
      dir: proj.dir,
      speed: proj.speed,
      launchTs: proj.startTime,
      hitRadius: SKILLS[proj.skillId].projectile?.hitRadius || 0.5
    } as ProjSpawn2);
  });
}
