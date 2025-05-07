import { Socket } from 'socket.io';
import { LearnSkill, SetSkillShortcut } from '../shared/messages.js';
import { SkillId } from '../shared/skillsDefinition.js';

import { canPlayerLearnSkill, learnNewSkill, setSkillShortcut } from './skillManager.js';

// Define simplified types for what we need from the game state
interface Player {
  id: string;
  socketId: string;
  level: number;
  className: string;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
}

interface GameState {
  players: Record<string, Player>;
}

/**
 * Handle the LearnSkill message 
 */
export function onLearnSkill(socket: Socket, state: GameState, msg: LearnSkill): void {
  console.log(`[SKILL] Received LearnSkill request for skill: ${msg.skillId}`);
  
  // Get player by socket ID
  const playerId = Object.keys(state.players).find(
    id => state.players[id].socketId === socket.id
  );
  
  if (!playerId) {
    console.warn(`[SKILL] Learn skill request from unknown socket: ${socket.id}`);
    return;
  }
  
  const player = state.players[playerId];
  console.log(`[SKILL] Player ${playerId} info:`, {
    className: player.className,
    level: player.level,
    unlockedSkills: player.unlockedSkills,
    availableSkillPoints: player.availableSkillPoints
  });
  
  // Skip if player already has this skill
  if (player.unlockedSkills.includes(msg.skillId)) {
    console.log(`[SKILL] Player ${playerId} already has skill: ${msg.skillId}`);
    socket.emit('msg', {
      type: 'SkillLearned',
      skillId: msg.skillId,
      remainingPoints: player.availableSkillPoints
    });
    return;
  }
  
  // Validate player has skill points to spend
  if (player.availableSkillPoints <= 0) {
    console.warn(`[SKILL] Player ${playerId} has no skill points to learn ${msg.skillId}`);
    return;
  }
  
  // Check if player can learn this skill based on class and level requirements
  if (canPlayerLearnSkill(player, msg.skillId)) {
    // Learn the skill using skillManager function
    if (learnNewSkill(player, msg.skillId)) {
      console.log(`[SKILL] Player ${playerId} learned skill: ${msg.skillId}`);
      
      // Send notification to client
      socket.emit('msg', {
        type: 'SkillLearned',
        skillId: msg.skillId,
        remainingPoints: player.availableSkillPoints
      });
      
      // Broadcast player update to all clients
      socket.broadcast.emit('playerUpdated', {
        id: player.id,
        unlockedSkills: player.unlockedSkills,
        skillShortcuts: player.skillShortcuts,
        availableSkillPoints: player.availableSkillPoints
      });
    } else {
      console.warn(`[SKILL] Failed to learn skill ${msg.skillId} for player ${playerId}`);
    }
  } else {
    console.warn(`[SKILL] Player ${playerId} cannot learn skill: ${msg.skillId}`);
  }
}

/**
 * Handle the SetSkillShortcut message
 */
export function onSetSkillShortcut(socket: Socket, state: GameState, msg: SetSkillShortcut): void {
  console.log(`[SKILL] Received SetSkillShortcut request for slot ${msg.slotIndex}: ${msg.skillId}`);
  
  // Get player by socket ID
  const playerId = Object.keys(state.players).find(
    id => state.players[id].socketId === socket.id
  );
  
  if (!playerId) {
    console.warn(`[SKILL] Set skill shortcut request from unknown socket: ${socket.id}`);
    return;
  }
  
  const player = state.players[playerId];
  
  // Validate slot index is valid (0-8 for keys 1-9)
  if (msg.slotIndex < 0 || msg.slotIndex > 8) {
    console.warn(`[SKILL] Invalid shortcut slot index: ${msg.slotIndex}`);
    return;
  }
  
  // If clearing the slot, allow it
  if (msg.skillId === null) {
    if (setSkillShortcut(player, msg.slotIndex, null)) {
      console.log(`[SKILL] Player ${playerId} cleared shortcut slot ${msg.slotIndex}`);
      
      // Send confirmation to client
      socket.emit('msg', {
        type: 'SkillShortcutUpdated',
        slotIndex: msg.slotIndex,
        skillId: null
      });
      
      // Broadcast player update to all clients
      socket.broadcast.emit('playerUpdated', {
        id: player.id,
        skillShortcuts: player.skillShortcuts
      });
    }
    return;
  }
  
  // Validate skill is unlocked
  if (!player.unlockedSkills.includes(msg.skillId)) {
    console.warn(`[SKILL] Player ${playerId} tried to shortcut skill they don't have: ${msg.skillId}`);
    return;
  }
  
  // Update skill shortcut
  if (setSkillShortcut(player, msg.slotIndex, msg.skillId)) {
    console.log(`[SKILL] Player ${playerId} set shortcut slot ${msg.slotIndex} to skill: ${msg.skillId}`);
    
    // Send confirmation to client
    socket.emit('msg', {
      type: 'SkillShortcutUpdated',
      slotIndex: msg.slotIndex,
      skillId: msg.skillId
    });
    
    // Broadcast player update to all clients
    socket.broadcast.emit('playerUpdated', {
      id: player.id,
      skillShortcuts: player.skillShortcuts
    });
  } else {
    console.warn(`[SKILL] Failed to set shortcut for player ${playerId}`);
  }
}
