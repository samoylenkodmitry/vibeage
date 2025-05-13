import { Socket, Server } from 'socket.io';
import { SKILLS, SkillId } from '../../shared/skillsDefinition.js';
import { CastReq, CastFail, CastSnapshotMsg, ProjSpawn2, ProjHit2 } from '../../shared/messages.js';
import { getManaCost, getCooldownMs, getDamage } from '../../shared/combatMath.js';
import { VecXZ } from '../../shared/messages.js';
import { Vec3D } from '../../shared/messages.js';
import { predictPosition, distance } from '../../shared/positionUtils.js';
import { CastState as CastStateEnum, CastSnapshot } from '../../shared/types.js';
import { nanoid } from 'nanoid';
import { PlayerState as Player } from '../../shared/types.js';

// Import getDamage from shared/combatMath.js
import { getDamage as getSkillDamage } from '../../shared/combatMath.js';

/**
 * Get world interface for interacting with game state
 */
interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => Player | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => any[];
}

/**
 * Calculate damage for a skill based on the skill and caster stats, using the shared implementation
 * @param skill The skill object with dmg property
 * @param caster Optional caster with stats
 * @param castId The unique ID of the cast
 * @param targetId The ID of the target
 * @returns The calculated damage amount
 */
function calculateDamage(skill: any, caster?: any, castId?: string, targetId?: string): number {
  if (!skill || !skill.dmg) return 10; // Default damage
  
  const result = getDamage({
    caster: caster?.stats || { dmgMult: 1, critChance: 0, critMult: 2 },
    skill: { base: skill.dmg, variance: 0.1 },
    seed: `${castId || nanoid()}:${targetId || nanoid()}`
  });
  
  return result.dmg;
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
  origin: Vec3D;
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
  if ((player.skillCooldownEndTs?.[skillId] && now < player.skillCooldownEndTs[skillId]) || 
      (player.skillCooldownEndTs?.[skillId] && now < player.skillCooldownEndTs[skillId])) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: req.clientTs,
      reason: 'cooldown'
    } as CastFail);
    return;
  }
  
  // Check mana cost
  const manaCost = getManaCost(skillId);
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
  const cooldownMs = getCooldownMs(skillId);
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
  
  // Legacy CastStart removed - using only CastSnapshot
  
  // Create a new Cast object for the enhanced system
  const newCast: Cast = {
    castId: nanoid(),
    casterId: player.id,
    skillId,
    state: CastStateEnum.Casting,
    origin: { x: player.position.x, y: player.position.y + 1.5, z: player.position.z },
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
      
      // Legacy CastEnd message removed
      
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
  // Handle any side effects of the completed cast
  // e.g., apply an effect, trigger an event, etc.

  // Set cast state to completed
  cast.state = 'completed';
}

/**
 * Gets and clears the completed casts queue
 * Other systems should call this to process completed casts
 */
export function getCompletedCasts(): CastState[] {
  const temp = [...completedCasts];
  completedCasts = [];
  return temp;
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
 * Resolves the impact of a skill, applying damage and effects
 */
function resolveImpact(cast: Cast, io: Server, world: World): void {
  const skill = SKILLS[cast.skillId];
  const targets = getTargetsInArea(cast, world);
  const caster = world.getPlayerById(cast.casterId);
  
  // Calculate damage for each target
  const dmgValues = targets.map((target: any) => 
    calculateDamage(skill, caster, cast.castId, target.id)
  );
  
  // Apply damage to each target
  targets.forEach((target: any, index: number) => {
    // Apply damage if target has health
    if (target.health !== undefined) {
      target.health = Math.max(0, target.health - dmgValues[index]);
      
      // Apply skill effects
      if (skill.effects && skill.effects.length > 0) {
        applySkillEffects(target, skill, cast.casterId);
      }
      
      // Check if target died
      if (target.health <= 0 && target.isAlive) {
        target.isAlive = false;
        target.deathTimeTs = Date.now();
      }
    }
  });
  
  // Emit hit notification with targets
  io.emit('msg', {
    type: 'InstantHit',
    skillId: cast.skillId,
    origin: cast.origin,
    targetPos: cast.targetPos || { x: 0, y: 0, z: 0 },
    hitIds: targets.map((t: any) => t.id),
    dmg: dmgValues
  });
}

/**
 * Gets all targets in the area of effect for a skill
 */
function getTargetsInArea(cast: Cast, world: World): any[] {
  const skill = SKILLS[cast.skillId];
  const pos = cast.pos || cast.origin; // Use current projectile position if available
  
  // Get radius of impact
  let radius = 0.5; // Default small radius
  
  if (skill.projectile?.splashRadius) {
    radius = skill.projectile.splashRadius; // Use splash radius for AoE
  } else if (skill.projectile?.hitRadius) {
    radius = skill.projectile.hitRadius; // Use hit radius for direct hit
  } else if (skill.area) {
    radius = skill.area; // Use area for instant AoE skills
  }
  
  // Get entities in range
  return world.getEntitiesInCircle({ x: pos.x, z: pos.z }, radius);
}

/**
 * Apply skill effects to a target
 */
function applySkillEffects(target: any, skill: any, casterId: string): void {
  if (!skill.effects || skill.effects.length === 0) return;
  
  // Apply each effect
  for (const effect of skill.effects) {
    if (!effect.type || !effect.value) continue;
    
    // Create status effect
    const statusEffect = {
      id: nanoid(),
      type: effect.type,
      value: effect.value,
      durationMs: effect.durationMs || 0,
      startTimeTs: Date.now(),
      sourceSkill: skill.id
    };
    
    // Add to target's status effects
    if (!target.statusEffects) {
      target.statusEffects = [];
    }
    
    // Check for existing effect of same type and replace if found
    const existingIndex = target.statusEffects.findIndex(
      (e: any) => e.type === effect.type
    );
    
    if (existingIndex >= 0) {
      target.statusEffects[existingIndex] = statusEffect;
    } else {
      target.statusEffects.push(statusEffect);
    }
  }
}

/**
 * Updates and progresses active casts, transitions them between states
 * Fully implemented server-authoritative state machine
 */
export function tickCasts(dt: number, io: Server, world: World): void {
  const now = Date.now();
  const lastTickMs = now - dt;
  
  for (let i = activeCastsNew.length - 1; i >= 0; i--) {
    const cast = activeCastsNew[i];
    
    // Skip casts that are already in their final state and remove after delay
    if (cast.state === CastStateEnum.Impact) {
      // Remove completed casts after a delay
      if (now - cast.startedAt > 5000) { // 5 seconds after cast started
        activeCastsNew.splice(i, 1);
      }
      continue;
    }
    
    // Check if cast time is complete for casts in Casting state
    if (cast.state === CastStateEnum.Casting && now - cast.startedAt >= cast.castTimeMs) {
      const skill = SKILLS[cast.skillId];
      const isProjectileSkill = skill.projectile !== undefined;
      
      // Transition to Traveling or Impact based on skill type
      cast.state = isProjectileSkill ? CastStateEnum.Traveling : CastStateEnum.Impact;
      
      // Make a snapshot to broadcast the state change
      const castSnapshot: CastSnapshot = {
        castId: cast.castId,
        casterId: cast.casterId,
        skillId: cast.skillId,
        state: cast.state,
        origin: cast.origin,
        target: cast.targetPos,
        startedAt: cast.startedAt,
        castTimeMs: cast.castTimeMs
      };
      
      // Broadcast the state change
      io.emit('msg', {
        type: 'CastSnapshot',
        data: castSnapshot
      });
      
      // If it's an instant cast, resolve impact immediately
      if (cast.state === CastStateEnum.Impact) {
        resolveImpact(cast, io, world);
        continue;
      }
          
          // Calculate travel time in milliseconds
          const speed = skill.projectile?.speed || 5;
          const dist = tgtPos ? 
            Math.sqrt(
              Math.pow(tgtPos.x - cast.origin.x, 2) + 
              Math.pow(tgtPos.z - cast.origin.z, 2)
            ) : skill.range || 10; // Default to skill range if no target
          
          const travelS = dist / speed;
          const travelMs = travelS * 1000;
          
          // Create projectile
          const projectile: Projectile = {
            castId: cast.castId,
            pos: { ...cast.origin },
            dir,
            speed: speed,
            distanceTraveled: 0,
            maxRange: skill.range || 10,
            startTime: now,
            skillId: cast.skillId
          };
          
          // Check if a projectile with this castId already exists
          const existingProjIndex = projectiles.findIndex(p => p.castId === cast.castId);
          if (existingProjIndex >= 0) {
            console.warn(`[SkillManager] Duplicate projectile detected for castId ${cast.castId}. Removing previous.`);
            projectiles.splice(existingProjIndex, 1);
          }
          
          projectiles.push(projectile);
          
          // Log before sending ProjSpawn2 message
          console.log(`[SkillManager] Sending ProjSpawn2 for castId: ${cast.castId}, skillId: ${cast.skillId}`);
          
          // Emit projectile spawn with travelMs
          io.emit('msg', {
            type: 'ProjSpawn2',
            castId: cast.castId,
            origin: cast.origin,
            dir,
            speed: projectile.speed,
            launchTs: now,
            hitRadius: skill.projectile?.hitRadius,
            travelMs: travelMs,
            casterId: cast.casterId,
            skillId: cast.skillId
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

/**
 * Updates projectile positions and handles collisions
 */
export function tickProjectiles(dt: number, io: Server, world: World): void {

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
          
          // Calculate damage for each victim using the shared getDamage function
          const dmgArr = victims.map((v: any) => calculateDamage(
            skill, 
            caster, 
            cast.castId, 
            v.id
          ));
          
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
