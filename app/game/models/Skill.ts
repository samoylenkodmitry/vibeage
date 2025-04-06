export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string; // Path to icon image
  damage?: number;
  manaCost: number;
  cooldown: number; // in seconds
  range: number;
  areaOfEffect?: number;
  levelRequired: number;
  effects: SkillEffect[];
  castTime: number; // in seconds, 0 for instant cast
  projectileSpeed?: number; // for projectile-based skills
  duration?: number; // for skills with duration effects
}

export type SkillEffectType = 
  | 'damage' 
  | 'stun' 
  | 'slow' 
  | 'dot' // damage over time
  | 'burn' // burn damage over time
  | 'poison' // poison damage over time
  | 'waterWeakness' // increases water damage taken
  | 'freeze' 
  | 'transform'; // for stone conversion

export interface SkillEffect {
  type: SkillEffectType;
  value: number; // damage amount, stun duration, slow percentage, etc.
  duration?: number; // how long effect lasts in seconds
}

// Define all skills available in the game
export const SKILLS: Record<string, Skill> = {
  'fireball': {
    id: 'fireball',
    name: 'Fireball',
    description: 'Launches a ball of fire that deals damage and applies a burn effect',
    icon: '/skills/fireball.png',
    damage: 20,
    manaCost: 10,
    cooldown: 2,
    range: 15,
    levelRequired: 1,
    castTime: 0.5,
    projectileSpeed: 20,
    effects: [
      { type: 'damage', value: 20 },
      { type: 'burn', value: 1, duration: 5 } // Burns enemy for 1% damage for 5 seconds
    ]
  },
  'water': {
    id: 'water',
    name: 'Water Splash',
    description: 'Creates a splash of water that damages enemies and slows them down',
    icon: '/skills/water.png',
    damage: 15,
    manaCost: 15,
    cooldown: 3,
    range: 10,
    areaOfEffect: 20, 
    levelRequired: 2,
    castTime: 0.8,
    effects: [
      { type: 'damage', value: 15 },
      { type: 'waterWeakness', value: 30, duration: 5 } // Makes enemy take 30% more damage from water attacks
    ]
  },
  'icebolt': {
    id: 'icebolt',
    name: 'Ice Bolt',
    description: 'Fires a bolt of ice that poisons enemies and slows their movement',
    icon: '/skills/icebolt.png',
    damage: 25,
    manaCost: 20,
    cooldown: 4,
    range: 12,
    levelRequired: 3,
    castTime: 1.0,
    projectileSpeed: 15,
    effects: [
      { type: 'damage', value: 25 },
      { type: 'poison', value: 0.5, duration: 10 }, // Poisons enemy for 0.5% damage for 10 seconds
      { type: 'slow', value: 50, duration: 10 } // Slows enemy by 50% for 10 seconds
    ]
  },
  'petrify': {
    id: 'petrify',
    name: 'Petrify',
    description: 'Temporarily stuns an enemy, preventing them from moving or attacking',
    icon: '/skills/petrify.png',
    damage: 20,
    manaCost: 30,
    cooldown: 10,
    range: 8,
    levelRequired: 4,
    castTime: 1.5,
    projectileSpeed: 12,
    effects: [
      { type: 'damage', value: 20 },
      { type: 'stun', value: 100, duration: 2 } // Stuns enemy completely for 2 seconds
    ]
  }
};