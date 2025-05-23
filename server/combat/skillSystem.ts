import { Server } from 'socket.io';
import { SKILLS, SkillId } from '../../shared/skillsDefinition.js';
import { VecXZ } from '../../shared/messages.js';
import { CastState as CastStateEnum, CastSnapshot, Enemy } from '../../shared/types.js';
import { nanoid } from 'nanoid';
import { PlayerState as Player } from '../../shared/types.js';
import { getDamage } from '../../shared/combatMath.js';
import { sweptHit } from '../collision.js';

// Set of constants for skill system
export const CAST_BROADCAST_RATE = 50; // ms, how often to send cast snapshots

/**
 * Get world interface for interacting with game state
 */
interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => Player | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => any[];
  onTargetDied: (caster: Player, target: Enemy | Player) => void;
}

/**
 * Server-side Cast object with complete state machine
 */
export interface Cast {
  castId: string;
  casterId: string;
  skillId: SkillId;
  state: CastStateEnum;
  origin: VecXZ;
  target?: VecXZ;
  pos?: VecXZ; // Current position for projectiles
  dir?: VecXZ; // Direction for projectiles
  startedAt: number; // When the cast started
  progressMs?: number; // Progress in milliseconds since cast started
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
 * Create a snapshot of a cast for network transmission
 */
function makeSnapshot(cast: Cast): CastSnapshot {
  const snapshot: CastSnapshot = {
    castId: cast.castId,
    casterId: cast.casterId,
    skillId: cast.skillId,
    state: cast.state,
    startedAt: cast.startedAt,
    castTimeMs: cast.castTimeMs,
    progressMs: cast.progressMs || 0,
    origin: cast.origin,
    pos: cast.pos,
    dir: cast.dir,
  };
  
  return snapshot;
}

/**
 * Resolves the impact of a skill, applying damage and effects
 */
function resolveImpact(cast: Cast, io: Server, world: World): void {
  console.log(`[resolveImpact] Resolving impact for castId: ${cast.castId}, skillId: ${cast.skillId}`);
  const skill = SKILLS[cast.skillId];
  
  // Get all targets in the area of effect
  const targets = getTargetsInArea(cast, world);
  const caster = world.getPlayerById(cast.casterId);
  
  // Calculate damage for each target
  const dmgValues = targets.map((target: any) => 
    calculateDamage(skill, caster, cast.castId, target.id)
  );
  
  console.log(`[resolveImpact] Damage values: ${dmgValues}`);
  console.log(`[resolveImpact] Targets: ${JSON.stringify(targets)}`);
  // Apply damage to each target
  targets.forEach((target: any, index: number) => {
    // Apply damage if target has health
    if (target.health !== undefined) {
      target.health = Math.max(0, target.health - dmgValues[index]);
      
      // Set enemy aggro to caster if this is an enemy and damage was dealt
      if (target.type && dmgValues[index] > 0 && caster && target.isAlive) {
        target.targetId = caster.id;
        target.aiState = 'chasing';
        console.log(`[resolveImpact] Enemy ${target.id} aggroed to player ${caster.id} after taking ${dmgValues[index]} damage`);
      }
      
      // Apply skill effects
      if (skill.effects && skill.effects.length > 0) {
        applySkillEffects(target, skill);
      }
      
      // Check if target died
      if (target.health <= 0 && target.isAlive) {
        target.deathTimeTs = Date.now();
        world.onTargetDied(caster, target);
      }
      
      // Broadcast effect on the target
      io.emit('msg', {
        type: 'EffectSnapshot',
        targetId: target.id,
        effects: target.statusEffects
      });
      
      // Broadcast target state update
      io.emit('enemyUpdated', target);
    }
  });
  
  // Emit combat log message with damage values
  io.emit('msg', {
    type: 'CombatLog',
    castId: cast.castId,
    skillId: cast.skillId,
    casterId: cast.casterId,
    targets: targets.map((t: any) => t.id),
    damages: dmgValues
  });
}

/**
 * Get targets in the area of effect of a skill
 */
function getTargetsInArea(cast: Cast, world: World): any[] {
  const skill = SKILLS[cast.skillId];
  const targets: any[] = [];
  
  // Default position to check (projectile position or caster position)
  const pos = cast.pos || cast.origin;
  
  // Direct targeted cast
  if (cast.targetId) {
    const target = world.getEnemyById(cast.targetId);
    if (target && target.isAlive) {
      targets.push(target);
    }
  }
  
  // Area of effect
  if (skill.area && skill.area > 0) {
    // Get all entities in the area (includes players and enemies)
    const entitiesInArea = world.getEntitiesInCircle(pos, skill.area);
    
    // Filter based on skill targeting rules (e.g., enemies only, exclude caster, etc.)
    entitiesInArea.forEach(entity => {
      if (entity.id !== cast.casterId && entity.isAlive) {
        // Skip if we already have this target
        if (!targets.find(t => t.id === entity.id)) {
          targets.push(entity);
        }
      }
    });
  }
  
  return targets;
}

/**
 * Apply skill effects to a target
 */
function applySkillEffects(target: any, skill: any): void {
  if (!skill.effects || !target) return;
  
  // Apply each effect
  for (const effect of skill.effects) {
    // Skip effects without a duration
    if (!effect.durationMs) continue;
    
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
    
    // Check for existing effect of same type
    const existingIndex = target.statusEffects.findIndex(
      (e: any) => e.type === effect.type
    );
    
    // Check if we need to handle effect stacking
    const isStackable = effect.stackable === true;
    
    if (existingIndex >= 0) {
      const existing = target.statusEffects[existingIndex];
      
      // If it's a stackable effect, update stacks
      if (isStackable && existing) {
        // Get max stacks from effect def
        const maxStacks = effect.maxStacks || 1;
        
        // Create a new effect with incremented stacks
        const newEffect = {
          ...statusEffect,
          stacks: Math.min(((existing as any).stacks || 1) + 1, maxStacks)
        };
        
        target.statusEffects[existingIndex] = newEffect;
      } else {
        // Replace the existing effect if not stackable
        target.statusEffects[existingIndex] = statusEffect;
      }
    } else {
      // Add the new effect
      if (isStackable) {
        // For new stackable effects, start with 1 stack
        (statusEffect as any).stacks = 1;
      }
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
 * Handle a new cast request from a player
 */
export function handleCastRequest(
  player: Player, 
  casterId: string,
  skillId: SkillId,
  targetPos: VecXZ | undefined,
  targetId: string | undefined,
  io: Server, 
  world: World
): string | Cast['castId'] {
  const now = Date.now();
  const skill = SKILLS[skillId];
  
  if (!skill) {
    console.error(`[handleCastRequest] Invalid skill ID: ${skillId}`);
    return 'invalid';
  }
  
  console.log(`[handleCastRequest] Creating new cast: casterId=${casterId}, skillId=${skillId}, targetId=${targetId}, targetPos=${JSON.stringify(targetPos)}`);
  
  // Create a new Cast
  const newCast: Cast = {
    castId: nanoid(),
    casterId: casterId,
    skillId: skillId,
    state: CastStateEnum.Casting,
    origin: { x: player.position.x, z: player.position.z },
    startedAt: now,
    castTimeMs: skill.castMs || 0,
    targetId: targetId,
    targetPos: targetPos,
    pos: { x: player.position.x, z: player.position.z }
  };
  
  if (!targetPos && !targetId) {
    console.warn(`[handleCastRequest] No target position or ID provided for cast: ${newCast.castId}`);
    return 'missingTarget';
  }
  
  // Calculate direction if projectile
  if (skill.projectile) {
    let targetPosVec: VecXZ | undefined;
    
    if (targetPos) {
      targetPosVec = targetPos;
    } else if (targetId) {
      const target = world.getEnemyById(targetId);
      if (target) {
        targetPosVec = { x: target.position.x, z: target.position.z };
      } else {
        console.warn(`[handleCastRequest] Target ID ${targetId} not found for cast: ${newCast.castId}`);
        return 'targetNotFound';
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
        console.log(`[handleCastRequest] Set projectile direction: [${newCast.dir.x.toFixed(2)}, ${newCast.dir.z.toFixed(2)}], speed: ${newCast.speed}`);
      }
    }
  }
  
  // Add to active casts
  activeCasts.push(newCast);
  console.log(`[handleCastRequest] Added to activeCasts. Total active casts: ${activeCasts.length}`);
  
  // Broadcast initial cast snapshot
  const snapshot = makeSnapshot(newCast);
  console.log(`[handleCastRequest] Broadcasting initial CastSnapshot: ${JSON.stringify(snapshot)}`);
  
  io.emit('msg', {
    type: 'CastSnapshot',
    data: snapshot
  });
  
  // Set player UI info
  if (player) {
    player.castingSkill = skillId;
    player.castingProgressMs = 0;
    
    // Also broadcast the player's updated casting state
    console.log(`[handleCastRequest] Broadcasting playerUpdated with castingSkill=${skillId}, castingProgressMs=0`);
    io.emit('playerUpdated', {
      id: player.id,
      mana: player.mana,
      skillCooldownEndTs: player.skillCooldownEndTs,
      castingSkill: player.castingSkill,
      castingProgressMs: player.castingProgressMs
    });
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
      // Remove completed casts
      console.log(`[tickCasts] Removing completed cast: castId=${cast.castId}, skillId=${cast.skillId}`);
      activeCasts.splice(i, 1);
      continue;
    }
    
    // Check if cast time is complete for casts in Casting state
    if (cast.state === CastStateEnum.Casting && now - cast.startedAt >= cast.castTimeMs) {
      const skill = SKILLS[cast.skillId];
      const newState = skill.projectile ? CastStateEnum.Traveling : CastStateEnum.Impact;
      console.log(`[tickCasts] Cast complete, transitioning from Casting to ${newState}: castId=${cast.castId}, skillId=${cast.skillId}, casterId=${cast.casterId}`);
      
      cast.state = newState;
      
      // Update startedAt to when projectile *begins* traveling
      if (newState === CastStateEnum.Traveling) {
        cast.startedAt = now;
        console.log(`[tickCasts] Updated startedAt timestamp for traveling projectile: castId=${cast.castId}, startedAt=${cast.startedAt}`);
      }
      
      // Clear the player's casting state when casting is complete
      const player = world.getPlayerById(cast.casterId);
      if (player) {
        player.castingSkill = null;
        player.castingProgressMs = 0;
        
        // Broadcast that casting has finished for this player
        console.log(`[tickCasts] Broadcasting playerUpdated with null castingSkill for player: ${cast.casterId}`);
        io.emit('playerUpdated', {
          id: player.id,
          castingSkill: player.castingSkill,
          castingProgressMs: player.castingProgressMs
        });
      }
      
      // Broadcast state change
      const snapshot = makeSnapshot(cast);
      console.log(`[tickCasts] Broadcasting CastSnapshot for state change: ${JSON.stringify(snapshot)}`);
      io.emit('msg', {
        type: 'CastSnapshot',
        data: snapshot
      });
      
      // If instant skill, resolve impact immediately
      if (cast.state === CastStateEnum.Impact) {
        console.log(`[tickCasts] Resolving impact immediately for instant skill: castId=${cast.castId}, skillId=${cast.skillId}`);
        resolveImpact(cast, io, world);
      }
      continue;
    } else if (cast.state === CastStateEnum.Casting) {
      // Update casting progress
      const progressMs = now - cast.startedAt;
      const player = world.getPlayerById(cast.casterId);
      if (player) {
        player.castingProgressMs = progressMs;
        // Broadcast casting progress
        console.log(`[tickCasts] Broadcasting casting progress: casterId=${cast.casterId}, castingProgressMs=${progressMs}`);
        io.emit('playerUpdated', {
          id: player.id,
          castingSkill: cast.skillId,
          castingProgressMs: cast.castTimeMs
        });
      }
      cast.progressMs = progressMs;
      // Broadcast cast progress
      const snapshot = makeSnapshot(cast);
      console.log(`[tickCasts] Broadcasting CastSnapshot for casting progress: ${JSON.stringify(snapshot)}`);
      io.emit('msg', {
        type: 'CastSnapshot',
        data: snapshot
      });
      continue;
    }
    
    // Update traveling projectiles
    if (cast.state === CastStateEnum.Traveling) {
      const dtSeconds = (now - lastTickMs) / 1000; // deltaTime for this tick in seconds

      // find target new position and auto aim to it
      if (cast.targetId) {
        const target = world.getEnemyById(cast.targetId);
        if (target) {
          cast.targetPos = { x: target.position.x, z: target.position.z };
          const dx = cast.targetPos.x - cast.origin.x;
          const dz = cast.targetPos.z - cast.origin.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          
          // Update direction based on target position
          if (dist > 0) {
            cast.dir = { x: dx / dist, z: dz / dist };
            console.log(`[tickCasts] Updated projectile direction towards target: [${cast.dir.x.toFixed(2)}, ${cast.dir.z.toFixed(2)}]`);
          }
        }
      }
      
        // Store old position for swept hit detection
        const oldPos = { ...cast.pos };
        
        // Update position based on velocity and time
        cast.pos.x += cast.dir.x * cast.speed * dtSeconds;
        cast.pos.z += cast.dir.z * cast.speed * dtSeconds;
        
        // Broadcast position updates periodically
        if (!cast.lastBroadcast || now - cast.lastBroadcast > CAST_BROADCAST_RATE) {
          const snapshot = makeSnapshot(cast);
          console.log(`[tickCasts] Broadcasting projectile position update: castId=${cast.castId}, pos=[${cast.pos.x.toFixed(2)}, ${cast.pos.z.toFixed(2)}], moved=${Math.sqrt(Math.pow(cast.pos.x - oldPos.x, 2) + Math.pow(cast.pos.z - oldPos.z, 2)).toFixed(2)}m`);
          
          io.emit('msg', {
            type: 'CastSnapshot',
            data: snapshot
          });
          cast.lastBroadcast = now;
        }
        
        const skill = SKILLS[cast.skillId];
        const hitRadius = skill.projectile?.hitRadius || 0.5; // Use configured hit radius
        let hasHitSomething = false;

        // Check against all potential targets (enemies, other players if PvP)
        const potentialTargets = world.getEntitiesInCircle(cast.pos, hitRadius * 2); // Query a slightly larger area

        for (const entity of potentialTargets) {
          if (entity.id === cast.casterId || !entity.isAlive) continue; // Skip caster and dead entities

          // Check if this entity is an enemy (or valid target type)
          if (world.getEnemyById(entity.id)) { // Example: only hit enemies
            const entityPos = { x: entity.position.x, z: entity.position.z };
            
            // Use sweptHit for more reliable collision detection
            if (sweptHit(oldPos, cast.pos, entityPos, hitRadius)) {
              console.log(`[SkillSystem TickCasts] Projectile ${cast.castId} HIT entity ${entity.id} via sweptHit.`);
              hasHitSomething = true;
              break;
            }
          }
        }
        
        // Calculate distance from origin for range check
        const maxRange = skill.range || 50; // Default max range
        const distanceFromOrigin = Math.sqrt(
          Math.pow(cast.pos.x - cast.origin.x, 2) +
          Math.pow(cast.pos.z - cast.origin.z, 2)
        );

        // Check if projectile reached target, exceeded range, or hit something
        if (reachedTarget(cast) || distanceFromOrigin > maxRange || hasHitSomething) {
          if (distanceFromOrigin > maxRange) {
            console.log(`[SkillSystem TickCasts] Projectile ${cast.castId} exceeded max range (${distanceFromOrigin.toFixed(2)} > ${maxRange}).`);
          } else if (reachedTarget(cast)) {
            console.log(`[SkillSystem TickCasts] Projectile ${cast.castId} reached its initial target position.`);
          } else if (hasHitSomething) {
            console.log(`[SkillSystem TickCasts] Projectile ${cast.castId} hit a target.`);
          }
          
          cast.state = CastStateEnum.Impact;
          const snapshot = makeSnapshot(cast);
          io.emit('msg', {
            type: 'CastSnapshot',
            data: snapshot
          });
          resolveImpact(cast, io, world); // Resolve impact with the actual hit target(s)
        }
    }
  }
}

/**
 * Send snapshots of all active casts to a new client
 * @param client - Socket.IO socket or server instance to send snapshots to
 */
export function sendCastSnapshots(client: any): void {
  // Send all active casts to the client
  for (const cast of activeCasts) {
    client.emit('msg', {
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
