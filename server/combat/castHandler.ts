import { Socket, Server } from 'socket.io';
import { SKILLS, SkillId } from '../../shared/skillsDefinition.js';
import { CastReq, CastFail } from '../../shared/messages.js';
import { VecXZ } from '../../shared/messages.js';
import { PlayerState } from '../../shared/types.js';
import { handleCastRequest } from './skillSystem.js';

/**
 * World interface for interacting with game state
 */
interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => PlayerState | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => any[];
}

/**
 * Handles a cast request from the client
 * Integration point between the world.ts and the new skillSystem.ts
 */
export function handleCastRequest(
  socket: Socket,
  player: PlayerState,
  msg: CastReq,
  io: Server,
  world: World
): void {
  const playerId = msg.id;
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    return;
  }
  
  if (!player.unlockedSkills.includes(msg.skillId as SkillId)) {
    console.warn(`Player ${playerId} tried to cast not owned skill: ${msg.skillId}`);
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: 'invalid'
    } as CastFail);
    return;
  }
  
  const skillId = msg.skillId as SkillId;
  const skill = SKILLS[skillId];
  
  // Check if the skill exists
  if (!skill) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: 'invalid'
    } as CastFail);
    return;
  }
  
  // Check if player is alive
  if (!player.isAlive) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: 'invalid'
    } as CastFail);
    return;
  }
  
  // Check cooldown
  const now = Date.now();
  if (player.skillCooldownEndTs?.[skillId] && now < player.skillCooldownEndTs[skillId]) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: 'cooldown'
    } as CastFail);
    return;
  }
  
  // Check mana cost
  if (player.mana < skill.manaCost) {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: 'nomana'
    } as CastFail);
    return;
  }
  
  // Check range if this is a targeted ability
  if (skill.range && msg.targetId) {
    const target = world.getEnemyById(msg.targetId);
    if (!target) {
      socket.emit('msg', {
        type: 'CastFail',
        clientSeq: msg.clientTs,
        reason: 'outofrange'
      } as CastFail);
      return;
    }
    
    // Calculate distance to target
    const distance = Math.sqrt(
      Math.pow(player.position.x - target.position.x, 2) +
      Math.pow(player.position.z - target.position.z, 2)
    );
    
    if (distance > skill.range) {
      socket.emit('msg', {
        type: 'CastFail',
        clientSeq: msg.clientTs,
        reason: 'outofrange'
      } as CastFail);
      return;
    }
  }
  
  // All checks passed, consume mana
  player.mana -= skill.manaCost;
  
  // Set cooldown
  if (!player.skillCooldownEndTs) {
    player.skillCooldownEndTs = {};
  }
  player.skillCooldownEndTs[skillId] = now + skill.cooldownMs;
  
  // Create a cast using the server authoritative skill system
  const castResult = handleCastRequest(
    player,
    playerId,
    skillId,
    msg.targetPos,
    msg.targetId,
    io,
    world
  );
  
  // If castResult is a string, it's an error code
  if (typeof castResult === 'string') {
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: castResult
    } as CastFail);
    return;
  }
  
  // Broadcast player update (mana consumed, cooldown set)
  io.emit('playerUpdated', {
    id: player.id,
    mana: player.mana,
    skillCooldownEndTs: player.skillCooldownEndTs
  });
}
