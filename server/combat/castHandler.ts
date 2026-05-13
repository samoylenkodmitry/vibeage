import { Socket, Server } from 'socket.io';
import { SKILLS, SkillId } from '../../packages/content/skills.js';
import { CastReq, CastFail, VecXZ } from '../../packages/protocol/messages.js';
import { Enemy, PlayerState } from '../../shared/types.js';
import { handleCastRequest } from './skillSystem.js';
import type { ActiveCastStore } from './skillSystem.js';
import { canCast } from './utils/cast.js';
import { applySkillCostAndCooldown } from './cooldowns.js';

/**
 * World interface for interacting with game state
 */
interface World {
  getEnemyById: (id: string) => any | null;
  getPlayerById: (id: string) => PlayerState | null;
  getEntitiesInCircle: (pos: VecXZ, radius: number) => any[];
  onTargetDied: (caster: PlayerState, target: Enemy | PlayerState) => void;
}

type CastFailReason = CastFail['reason'];

/**
 * Handles a cast request from the client
 * Integration point between the world.ts and the new skillSystem.ts
 */
export function handleCastReq(
  socket: Socket,
  player: PlayerState,
  msg: CastReq,
  io: Server,
  world: World,
  activeCasts: ActiveCastStore
): void {
  const playerId = msg.id;
  
  // Verify player exists and belongs to this socket
  if (!player || player.socketId !== socket.id) {
    console.warn(`Invalid cast request: player=${playerId}, socketId mismatch`);
    return;
  }
  
  if (!player.unlockedSkills.includes(msg.skillId as SkillId)) {
    console.warn(`Player ${playerId} tried to cast not owned skill: ${msg.skillId}`);
    emitCastFail(socket, msg, 'invalid');
    return;
  }
  
  const skillId = msg.skillId as SkillId;
  const skill = SKILLS[skillId];
  
  // Check if the skill exists
  if (!skill) {
    emitCastFail(socket, msg, 'invalid');
    return;
  }
  
  // Get target if any
  const target = msg.targetId ? world.getEnemyById(msg.targetId) : null;
  const now = Date.now();

  if (!target && !msg.targetPos) {
    emitCastFail(socket, msg, 'invalid');
    return;
  }
  
  // Use the canCast utility function to validate the cast
  const castCheck = canCast(player, { id: skillId, range: skill.range || 0 }, target, msg.targetPos, now);
  if (!castCheck.canCast) {
    console.log(`Cast failed for player ${playerId}, skill ${skillId}: ${castCheck.reason}`);
    emitCastFail(socket, msg, castCheck.reason || 'invalid');
    return;
  }
  
  const resourceUpdate = applySkillCostAndCooldown(player, skillId, skill, now);
  
  // Create a cast using the server authoritative skill system
  const castResult = handleCastRequest(
    activeCasts,
    player,
    playerId,
    skillId,
    msg.targetPos,
    msg.targetId,
    io,
    world
  );
  
  // If castResult is a string and it's one of our valid error reasons,
  // it's an error. Otherwise, it's a successful cast ID (nanoid)
  if (typeof castResult === 'string' && isCastFailReason(castResult)) {
    console.log(`Cast failed for player ${playerId}, skill ${skillId}: ${castResult}`);
    emitCastFail(socket, msg, castResult);
    return;
  }
  
  // If we got here, the cast was successful and castResult is the cast ID
  
  // Broadcast player update (mana consumed, cooldown set)
  io.emit('playerUpdated', {
    id: player.id,
    ...resourceUpdate,
  });
}

function emitCastFail(socket: Socket, msg: CastReq, reason: CastFailReason): void {
  socket.emit('msg', {
    type: 'CastFail',
    clientSeq: msg.clientTs,
    reason,
  } as CastFail);
}

function isCastFailReason(reason: string): reason is CastFailReason {
  return reason === 'cooldown' || reason === 'nomana' || reason === 'invalid' || reason === 'outofrange';
}
