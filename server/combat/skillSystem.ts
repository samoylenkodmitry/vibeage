import { Server } from 'socket.io';
import { SKILLS, SkillId } from '../../shared/skillsDefinition.js';
import { VecXZ, Vec3D } from '../../shared/messages.js';
import { CastState as CastStateEnum, CastSnapshot } from '../../shared/types.js';
import { predictPosition, distance } from '../../shared/positionUtils.js';
import { nanoid } from 'nanoid';
import { PlayerState as Player } from '../../shared/types.js';
import { getDamage } from '../../shared/combatMath.js';

/**
 * Get world interface for interacting with game state
 */
interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => Player | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => any[];
}

/**
 * Server-side Cast object with complete state machine
 */
export interface Cast {
  castId: string;
  casterId: string;
  skillId: SkillId;
  state: CastStateEnum;
  origin: Vec3D;
  target?: VecXZ;
  pos?: VecXZ; // Current position for projectiles
  dir?: VecXZ; // Direction for projectiles
  startedAt: number; // When the cast started
  lastBroadcast?: number; // Last time position was broadcast
  castTimeMs: number;
  targetId?: string;
  targetPos?: VecXZ;
  speed?: number; // Projectile speed
}

// Collection of active casts
const activeCasts: Cast[] = [];

/**
 * Calculate damage for a skill based on the skill and caster stats
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

/**
 * Create a CastSnapshot from a Cast object
 */
function makeSnapshot(cast: Cast): CastSnapshot {
  return {
    castId: cast.castId,
    casterId: cast.casterId,
    skillId: cast.skillId,
    state: cast.state,
    origin: cast.origin,
    target: cast.targetPos,
    pos: cast.pos, // Include current position for projectiles
    startedAt: cast.startedAt,
    castTimeMs: cast.castTimeMs
  };
}

/**
 * Resolves the impact of a skill, applying damage and effects
 */
function resolveImpact(cast: Cast, io: Server, world: World): void {
  const skill = SKILLS[cast.skillId];
  
  // Get all targets in the area of effect
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
 * Check if a cast has reached its target or exceeded its range
 */
function reachedTarget(cast: Cast): boolean {
  if (!cast.pos || !cast.targetPos) return false;
  
  // Calculate distance to target
  const dist = Math.sqrt(
    Math.pow(cast.pos.x - cast.targetPos.x, 2) +
    Math.pow(cast.pos.z - cast.targetPos.z, 2)
  );
  
  // Consider reached if within 0.5 units
  return dist < 0.5;
}

/**
 * Check if a cast has exceeded its maximum range
 */
function exceededRange(cast: Cast): boolean {
  if (!cast.pos || !cast.origin) return false;
  
  const skill = SKILLS[cast.skillId];
  const maxRange = skill.range || 10;
  
  // Calculate distance from origin
  const dist = Math.sqrt(
    Math.pow(cast.pos.x - cast.origin.x, 2) +
    Math.pow(cast.pos.z - cast.origin.z, 2)
  );
  
  // Exceeded range if beyond max range
  return dist > maxRange;
}

/**
 * Handle a new cast request from a player
 */
export function handleCastRequest(player: Player, casterId: string, skillId: SkillId, targetPos?: VecXZ, targetId?: string, io: Server, world: World): string {
  const now = Date.now();
  const skill = SKILLS[skillId];
  
  if (!skill) {
    return 'invalid';
  }
  
  // Create a new Cast
  const newCast: Cast = {
    castId: nanoid(),
    casterId: casterId,
    skillId: skillId,
    state: CastStateEnum.Casting,
    origin: { x: player.position.x, y: player.position.y + 1.5, z: player.position.z },
    startedAt: now,
    castTimeMs: skill.castMs,
    targetId: targetId,
    targetPos: targetPos,
    pos: { x: player.position.x, y: player.position.y + 1.5, z: player.position.z } // Start at origin
  };
  
  // Calculate direction if projectile
  if (skill.projectile && (targetPos || targetId)) {
    let targetPosVec: VecXZ | undefined;
    
    if (targetPos) {
      targetPosVec = targetPos;
    } else if (targetId) {
      const target = world.getEnemyById(targetId);
      if (target) {
        targetPosVec = { x: target.position.x, z: target.position.z };
      }
    }
    
    if (targetPosVec) {
      // Calculate direction
      const dx = targetPosVec.x - newCast.origin.x;
      const dz = targetPosVec.z - newCast.origin.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      // Set direction and speed
      if (dist > 0) {
        newCast.dir = { x: dx / dist, z: dz / dist };
        newCast.speed = skill.projectile.speed;
      }
    }
  }
  
  // Add to active casts
  activeCasts.push(newCast);
  
  // Broadcast initial cast snapshot
  io.emit('msg', {
    type: 'CastSnapshot',
    data: makeSnapshot(newCast)
  });
  
  // Set player UI info
  if (player) {
    player.castingSkill = skillId;
    player.castingProgressMs = 0;
  }
  
  return newCast.castId;
}

/**
 * Get an existing cast by ID
 */
export function getCastById(castId: string): Cast | undefined {
  return activeCasts.find(cast => cast.castId === castId);
}

/**
 * Updates and progresses active casts, transitions them between states
 * Fully implemented server-authoritative state machine
 */
export function tickCasts(dt: number, io: Server, world: World): void {
  const now = Date.now();
  const lastTickMs = now - dt;
  
  for (let i = activeCasts.length - 1; i >= 0; i--) {
    const cast = activeCasts[i];
    
    // Skip casts that are already in their final state and remove after delay
    if (cast.state === CastStateEnum.Impact) {
      // Remove completed casts after a delay
      if (now - cast.startedAt > 5000) { // 5 seconds after cast started
        activeCasts.splice(i, 1);
      }
      continue;
    }
    
    // Check if cast time is complete for casts in Casting state
    if (cast.state === CastStateEnum.Casting && now - cast.startedAt >= cast.castTimeMs) {
      const skill = SKILLS[cast.skillId];
      cast.state = skill.projectile ? CastStateEnum.Traveling : CastStateEnum.Impact;
      
      // Broadcast state change
      io.emit('msg', {
        type: 'CastSnapshot',
        data: makeSnapshot(cast)
      });
      
      // If instant skill, resolve impact immediately
      if (cast.state === CastStateEnum.Impact) {
        resolveImpact(cast, io, world);
      }
      continue;
    }
    
    // Update traveling projectiles
    if (cast.state === CastStateEnum.Traveling) {
      const dt = now - lastTickMs;
      
      // Make sure we have position and direction
      if (cast.pos && cast.dir && cast.speed) {
        // Update position based on velocity and time
        cast.pos.x += cast.dir.x * cast.speed * dt / 1000;
        cast.pos.z += cast.dir.z * cast.speed * dt / 1000;
        
        // Broadcast position updates periodically
        if (!cast.lastBroadcast || now - cast.lastBroadcast > 50) {
          io.emit('msg', {
            type: 'CastSnapshot',
            data: makeSnapshot(cast)
          });
          cast.lastBroadcast = now;
        }
        
        // Check if projectile reached destination or exceeded range
        if (reachedTarget(cast) || exceededRange(cast)) {
          cast.state = CastStateEnum.Impact;
          io.emit('msg', {
            type: 'CastSnapshot',
            data: makeSnapshot(cast)
          });
          resolveImpact(cast, io, world);
        }
      }
    }
  }
}

/**
 * Send snapshots of all active casts to a new client
 */
export function sendCastSnapshots(io: Server): void {
  // Send all active casts to all clients
  for (const cast of activeCasts) {
    io.emit('msg', {
      type: 'CastSnapshot',
      data: makeSnapshot(cast)
    });
  }
}

/**
 * Cancel an active cast
 */
export function cancelCast(casterId: string, skillId?: SkillId): boolean {
  const index = activeCasts.findIndex(cast => 
    cast.casterId === casterId && 
    (skillId ? cast.skillId === skillId : true) &&
    cast.state === CastStateEnum.Casting // Can only cancel during casting
  );
  
  if (index >= 0) {
    activeCasts.splice(index, 1);
    return true;
  }
  
  return false;
}

/**
 * Get all active casts
 */
export function getActiveCasts(): Cast[] {
  return [...activeCasts];
}
