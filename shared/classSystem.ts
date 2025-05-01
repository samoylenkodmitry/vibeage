// filepath: /home/s/develop/projects/vibe/1/shared/classSystem.ts
import { SkillId } from './skillsDefinition';

// Class types in the game
export type CharacterClass = 'mage' | 'warrior' | 'healer' | 'ranger';

// Interface for requirements to unlock skills
export interface SkillRequirement {
  level: number;
  classType?: CharacterClass; // If specified, skill is only available to this class
  requiredSkills?: SkillId[]; // Skills that must be learned before this one
}

// Class-specific skill progression tree
export interface ClassSkillTree {
  className: CharacterClass;
  description: string;
  baseStats: {
    healthMultiplier: number;
    manaMultiplier: number;
    damageMultiplier: number;
    speedMultiplier: number;
  };
  skillProgression: Record<SkillId, SkillRequirement>;
}

// Define skill trees for each class
export const CLASS_SKILL_TREES: Record<CharacterClass, ClassSkillTree> = {
  mage: {
    className: 'mage',
    description: 'Masters of elemental magic with high damage output but lower health',
    baseStats: {
      healthMultiplier: 0.8,
      manaMultiplier: 1.3,
      damageMultiplier: 1.2,
      speedMultiplier: 0.9
    },
    skillProgression: {
      'fireball': { level: 1 },  // Available immediately
      'waterSplash': { level: 2, requiredSkills: ['fireball'] },
      'iceBolt': { level: 3, requiredSkills: ['waterSplash'] },
      'petrify': { level: 4, requiredSkills: ['iceBolt'] }
    }
  },
  warrior: {
    className: 'warrior',
    description: 'Strong melee fighters with high health and defensive capabilities',
    baseStats: {
      healthMultiplier: 1.3,
      manaMultiplier: 0.7,
      damageMultiplier: 1.1,
      speedMultiplier: 1.0
    },
    skillProgression: {
      'fireball': { level: 2 }, // Warriors get fireball later
      'petrify': { level: 3 }
    }
  },
  healer: {
    className: 'healer',
    description: 'Support characters focused on healing and buffs',
    baseStats: {
      healthMultiplier: 0.9,
      manaMultiplier: 1.2,
      damageMultiplier: 0.8,
      speedMultiplier: 1.0
    },
    skillProgression: {
      'waterSplash': { level: 1 },
      'iceBolt': { level: 3 }
    }
  },
  ranger: {
    className: 'ranger',
    description: 'Long-range attackers with high speed and moderate damage',
    baseStats: {
      healthMultiplier: 0.9,
      manaMultiplier: 1.0,
      damageMultiplier: 1.1,
      speedMultiplier: 1.2
    },
    skillProgression: {
      'iceBolt': { level: 1 },
      'fireball': { level: 2 },
      'petrify': { level: 4 }
    }
  }
};

// Check if a player can learn a specific skill
export function canLearnSkill(
  skillId: SkillId, 
  playerClass: CharacterClass, 
  playerLevel: number, 
  playerSkills: SkillId[]
): boolean {
  const classTree = CLASS_SKILL_TREES[playerClass];
  if (!classTree) return false;
  
  const skillReq = classTree.skillProgression[skillId];
  if (!skillReq) return false; // Skill not available for this class
  
  // Check level requirement
  if (playerLevel < skillReq.level) return false;
  
  // Check prerequisite skills
  if (skillReq.requiredSkills) {
    for (const reqSkill of skillReq.requiredSkills) {
      if (!playerSkills.includes(reqSkill)) return false;
    }
  }
  
  return true;
}

// Get available skills to learn based on player's class, level and current skills
export function getAvailableSkills(
  playerClass: CharacterClass,
  playerLevel: number,
  playerSkills: SkillId[]
): SkillId[] {
  const classTree = CLASS_SKILL_TREES[playerClass];
  if (!classTree) return [];
  
  const availableSkills: SkillId[] = [];
  
  Object.entries(classTree.skillProgression).forEach(([skillId, req]) => {
    const skill = skillId as SkillId;
    // Skip skills player already has
    if (playerSkills.includes(skill)) return;
    
    // Check if player can learn this skill
    if (canLearnSkill(skill, playerClass, playerLevel, playerSkills)) {
      availableSkills.push(skill);
    }
  });
  
  return availableSkills;
}
