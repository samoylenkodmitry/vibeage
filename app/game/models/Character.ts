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
  skills: string[]; // IDs of skills the character has unlocked
  activeSkill: string | null; // ID of currently selected skill
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
    skills: ['fireball'], // Start with fireball skill
    activeSkill: 'fireball'
  };
};