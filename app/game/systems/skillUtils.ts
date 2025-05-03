'use client';

import { SKILLS, SkillId } from '../models/Skill';

/**
 * Utility functions for skill management that can be used across components
 */

/**
 * Helper function to validate and normalize a skill ID
 * @param skillId - A potential skill ID that needs validation
 * @returns A valid SkillId or null if invalid
 */
export function validateSkillId(skillId: any): SkillId | null {
  if (!skillId) return null;
  
  // If it's already a valid skill ID
  if (typeof skillId === 'string' && SKILLS[skillId as SkillId]) {
    return skillId as SkillId;
  }
  
  // Try to extract from a string that might contain a skill ID
  if (typeof skillId === 'string') {
    // Check if any known skill ID is part of this string
    const possibleMatch = Object.keys(SKILLS).find(id => 
      skillId.includes(id) || id.includes(skillId)
    );
    
    if (possibleMatch) {
      console.log(`Found matching skill: ${possibleMatch} from ${skillId}`);
      return possibleMatch as SkillId;
    }
  }
  
  return null;
}

/**
 * Get the proper skill icon path based on skill ID
 * @param skillId - The ID of the skill
 * @returns Path to the skill icon
 */
function getSkillIconPath(skillId: string) {
  // Special cases
  if (skillId === 'iceBolt') return '/game/skills/skill_icebolt.png';
  if (skillId === 'waterSplash') return '/game/skills/skill_water.png';
  
  // Default case - convert from skill ID to image path
  return `/game/skills/skill_${skillId}.png`;
}

const skillUtils = {
  validateSkillId,
  getSkillIconPath
};

export default skillUtils;
