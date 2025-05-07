// filepath: /home/s/develop/projects/vibe/1/server/skillManager.ts

import { SkillId} from '../shared/skillsDefinition.js';
import { canLearnSkill, CharacterClass, CLASS_SKILL_TREES } from '../shared/classSystem.js';

// Define simplified types for what we need from the game state
interface Player {
  id: string;
  socketId: string;
  level: number;
  className: string;
  unlockedSkills: SkillId[];
  skillShortcuts: (SkillId | null)[];
  availableSkillPoints: number;
  // Other player properties omitted
}

/**
 * Check if a player can learn a specific skill
 */
export function canPlayerLearnSkill(player: Player, skillId: SkillId): boolean {
  // Check that player has skill points
  if (player.availableSkillPoints <= 0) {
    return false;
  }
  
  // Check if player already has this skill
  if (player.unlockedSkills.includes(skillId)) {
    return false;
  }
  
  // Use the shared check from classSystem
  return canLearnSkill(
    skillId,
    player.className as CharacterClass,
    player.level,
    player.unlockedSkills as SkillId[]
  );
}

/**
 * Learn a new skill for the player
 */
export function learnNewSkill(player: Player, skillId: SkillId): boolean {
  try {
    // Skip if player already has the skill
    if (player.unlockedSkills.includes(skillId)) {
      return true; // Not an error, just already learned
    }
    
    // Check if player can learn this skill
    if (!canPlayerLearnSkill(player, skillId)) {
      console.log(`[LEARN_SKILL] Player ${player.id} failed to learn ${skillId} - requirements not met`);
      return false;
    }

    // Add skill to unlocked skills
    const oldSkillPoints = player.availableSkillPoints;
    player.unlockedSkills.push(skillId);
    
    // Deduct a skill point
    player.availableSkillPoints -= 1;
    
    console.log(`[LEARN_SKILL] Player ${player.id} learned ${skillId}. Skill points: ${oldSkillPoints} -> ${player.availableSkillPoints}`);
    
    // Automatically assign to the first empty shortcut slot if available
    const emptySlotIndex = player.skillShortcuts.findIndex(slot => slot === null);
    if (emptySlotIndex !== -1) {
      player.skillShortcuts[emptySlotIndex] = skillId;
    }
    
    return true;
  } catch (error) {
    console.error(`Error learning skill ${skillId}:`, error);
    return false;
  }
}

/**
 * Set a skill shortcut
 */
export function setSkillShortcut(player: Player, slotIndex: number, skillId: SkillId | null): boolean {
  try {
    // Validate slot index is within range (0-8 for keys 1-9)
    if (slotIndex < 0 || slotIndex > 8) {
      return false;
    }
    
    // If skillId is provided, validate it's unlocked
    if (skillId !== null && !player.unlockedSkills.includes(skillId)) {
      return false;
    }
    
    // If we're trying to set a skill (not clearing a slot)
    if (skillId !== null) {
      // Check if this skill is already assigned to a different shortcut slot
      const existingIndex = player.skillShortcuts.findIndex(id => id === skillId);
      if (existingIndex !== -1 && existingIndex !== slotIndex) {
        // Remove it from the existing slot to prevent duplicates
        console.log(`Skill ${skillId} already exists in slot ${existingIndex + 1}, removing from that slot`);
        player.skillShortcuts[existingIndex] = null;
      }
    }
    
    // Update the shortcut slot
    player.skillShortcuts[slotIndex] = skillId;
    
    return true;
  } catch (error) {
    console.error('Error setting skill shortcut:', error);
    return false;
  }
}

/**
 * Get available skills to learn for a player
 */
export function getAvailableSkillsToLearn(player: Player): SkillId[] {
  try {
    const availableSkills: SkillId[] = [];
    const classTree = CLASS_SKILL_TREES[player.className as CharacterClass];
    
    if (!classTree) {
      return [];
    }
    
    // Check all skills in class progression
    for (const [skillId, requirement] of Object.entries(classTree.skillProgression)) {
      // Skip skills player already has
      if (player.unlockedSkills.includes(skillId as SkillId)) {
        continue;
      }
      
      // Check if player can learn this skill
      if (canLearnSkill(
        skillId as SkillId,
        player.className as CharacterClass,
        player.level,
        player.unlockedSkills as SkillId[]
      )) {
        availableSkills.push(skillId as SkillId);
      }
    }
    
    return availableSkills;
  } catch (error) {
    console.error('Error getting available skills:', error);
    return [];
  }
}

/**
 * Award a skill point to a player (e.g., on level up)
 */
export function awardSkillPoint(player: Player): void {
  player.availableSkillPoints += 1;
}
