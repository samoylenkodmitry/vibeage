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
    description: 'Launches a ball of fire that deals damage on impact',
    icon: '/skills/fireball.png',
    damage: 20,
    manaCost: 10,
    cooldown: 2,
    range: 15,
    levelRequired: 1,
    castTime: 0.5,
    projectileSpeed: 20,
    effects: [
      { type: 'damage', value: 20 }
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
    areaOfEffect: 3,
    levelRequired: 2,
    castTime: 0.8,
    effects: [
      { type: 'damage', value: 15 },
      { type: 'slow', value: 30, duration: 2 } // Slows enemy by 30% for 2 seconds
    ]
  },
  'icebolt': {
    id: 'icebolt',
    name: 'Ice Bolt',
    description: 'Fires a bolt of ice that damages and slows enemies with a chance to freeze',
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
      { type: 'slow', value: 50, duration: 3 }, // Slows enemy by 50% for 3 seconds
      { type: 'freeze', value: 0, duration: 1 } // Has chance to freeze enemy for 1 second
    ]
  },
  'petrify': {
    id: 'petrify',
    name: 'Petrify',
    description: 'Turns an enemy to stone, immobilizing them and increasing damage taken',
    icon: '/skills/petrify.png',
    damage: 20, // Increased from 10
    manaCost: 30,
    cooldown: 10,
    range: 8,
    levelRequired: 4,
    castTime: 1.5,
    projectileSpeed: 12, // Added projectile speed
    effects: [
      { type: 'damage', value: 20 }, // Increased damage
      { type: 'transform', value: 100, duration: 4 }, // Extended duration from 2 to 4 seconds, 100% transform effect
      { type: 'slow', value: 100, duration: 4 } // Added complete immobilization effect
    ]
  }
};