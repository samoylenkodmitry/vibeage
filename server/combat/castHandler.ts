import { Socket, Server } from 'socket.io';
import { SKILLS, SkillId } from '../../shared/skillsDefinition.js';
import { CastReq, CastFail } from '../../shared/messages.js';
import { VecXZ } from '../../shared/messages.js';
import { Enemy, PlayerState } from '../../shared/types.js';
import { handleCastRequest } from './skillSystem.js';
import { canCast } from './utils/cast.js';

/**
 * World interface for interacting with game state
 */
interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => PlayerState | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => any[];
  onTargetDied: (caster: PlayerState, target: Enemy | PlayerState) => void;
}

/**
 * Handles a cast request from the client
 * Integration point between the world.ts and the new skillSystem.ts
 */
export function handleCastReq(
  socket: Socket,
  player: PlayerState,
  msg: CastReq,
  io: Server,
  world: World
): void {
  const playerId = msg.id;
  
  console.log(`Handling cast request: player=${playerId}, skill=${msg.skillId}, target=${msg.targetId || 'none'}`);
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    console.warn(`Invalid cast request: player=${playerId}, socketId mismatch`);
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
  
  // Get target if any
  const target = msg.targetId ? world.getEnemyById(msg.targetId) : null;
  const now = Date.now();
  
  // Use the canCast utility function to validate the cast
  const castCheck = canCast(player, { id: skillId, range: skill.range || 0 }, target, msg.targetPos, now);
  if (!castCheck.canCast) {
    console.log(`Cast failed for player ${playerId}, skill ${skillId}: ${castCheck.reason}`);
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: castCheck.reason || 'invalid'
    } as CastFail);
    return;
  }
  
  // Apply mana cost and cooldown
  player.mana -= skill.manaCost;
  
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
  
  // Valid error reasons
  const validReasons = ['cooldown', 'nomana', 'invalid', 'outofrange'];
  
  // If castResult is a string and it's one of our valid error reasons,
  // it's an error. Otherwise, it's a successful cast ID (nanoid)
  if (typeof castResult === 'string' && validReasons.includes(castResult)) {
    console.log(`Cast failed for player ${playerId}, skill ${skillId}: ${castResult}`);
    
    socket.emit('msg', {
      type: 'CastFail',
      clientSeq: msg.clientTs,
      reason: castResult as 'cooldown' | 'nomana' | 'invalid' | 'outofrange'
    } as CastFail);
    return;
  }
  
  // If we got here, the cast was successful and castResult is the cast ID
  
  // Broadcast player update (mana consumed, cooldown set)
  io.emit('playerUpdated', {
    id: player.id,
    mana: player.mana,
    skillCooldownEndTs: player.skillCooldownEndTs
  });
}
