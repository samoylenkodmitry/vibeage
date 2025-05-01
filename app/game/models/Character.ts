import { StatusEffect } from '../systems/gameStore';
import { CharacterClass } from '../../../shared/classSystem';
import { SkillId } from '../../../shared/skillsDefinition';

export interface Character {
  id: string;
  name: string;
  level: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  className: CharacterClass;
  unlockedSkills: SkillId[];     // All skills the player has learned
  availableSkillPoints: number;  // Points available to learn new skills
  activeSkill: string | null;    // ID of currently selected skill
  skillShortcuts?: (SkillId | null)[];  // Skills assigned to number keys 1-9
  isAlive?: boolean;             // Character alive status
  experience?: number;           // Current experience points
  experienceToNextLevel?: number; // Experience needed for next level
  statusEffects?: StatusEffect[]; // Active status effects
}

export const createCharacter = (name: string): Character => {
  return {
    id: `character-${Math.random().toString(36).substring(2, 9)}`,
    name,
    level: 1,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    mana: 50,
    maxMana: 50,
    className: 'mage',
    unlockedSkills: ['fireball'],
    availableSkillPoints: 0,
    activeSkill: 'fireball',
    skillShortcuts: ['fireball', null, null, null, null, null, null, null, null]
  };
};