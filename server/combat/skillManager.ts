import { Socket, Server } from 'socket.io';
import { SKILLS, SkillId } from '../../shared/skillsDefinition.js';
import { CastReq, CastStart, CastFail } from '../../shared/messages.js';
import { getManaCost, getCooldownMs } from '../../shared/combatMath.js';
import { VecXZ } from '../../shared/messages.js';
import { predictPosition } from '../world.js';

// Define the type for active casts
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
  // Other player properties
}

// Collection of active casts by all players
const activeCasts: CastState[] = [];
// Collection of completed casts to be processed
let completedCasts: CastState[] = [];

/**
 * Calculate distance between two points in 2D space
 */
function distance(a: VecXZ, b: VecXZ): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

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
