export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string; // Path to icon image
  damage?: number;
  manaCost: number;
  cooldownMs: number; // time in milliseconds
  range: number;
  areaOfEffect?: number;
  levelRequired: number;
  effects: SkillEffect[];
  castTimeMs: number; // 0 for instant cast, in ms
  projectileSpeed?: number; // for projectile-based skills
  durationMs?: number; // for skills with duration effects, in ms
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
  durationMs?: number; // how long the effect lasts, in ms
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
    cooldownMs: 2000,
    range: 15,
    levelRequired: 1,
    castTimeMs: 500,
    projectileSpeed: 20,
    effects: [
      { type: 'damage', value: 20 },
      { type: 'burn', value: 1, durationMs: 5000 } // 5 seconds
    ]
  },
  'water': {
    id: 'water',
    name: 'Water Splash',
    description: 'Creates a splash of water that damages enemies and slows them down',
    icon: '/skills/water.png',
    damage: 15,
    manaCost: 15,
    cooldownMs: 3000,
    range: 10,
    areaOfEffect: 20, 
    levelRequired: 2,
    castTimeMs: 800,
    effects: [
      { type: 'damage', value: 15 },
      { type: 'waterWeakness', value: 30, durationMs: 5000 } // Makes enemy take 30% more damage from water attacks
    ]
  },
  'icebolt': {
    id: 'icebolt',
    name: 'Ice Bolt',
    description: 'Fires a bolt of ice that poisons enemies and slows their movement',
    icon: '/skills/icebolt.png',
    damage: 25,
    manaCost: 20,
    cooldownMs: 4000,
    range: 12,
    levelRequired: 3,
    castTimeMs: 1000,
    projectileSpeed: 15,
    effects: [
      { type: 'damage', value: 25 },
      { type: 'poison', value: 0.5, durationMs: 10000 }, // Poisons enemy for 0.5% damage for 10 seconds
      { type: 'slow', value: 50, durationMs: 10000 } // Slows enemy by 50% for 10 seconds
    ]
  },
  'petrify': {
    id: 'petrify',
    name: 'Petrify',
    description: 'Temporarily stuns an enemy, preventing them from moving or attacking',
    icon: '/skills/petrify.png',
    damage: 20,
    manaCost: 30,
    cooldownMs: 10000,
    range: 8,
    levelRequired: 4,
    castTimeMs: 1500,
    projectileSpeed: 12,
    effects: [
      { type: 'damage', value: 20 },
      { type: 'stun', value: 100, durationMs: 2000 } // Stuns enemy completely for 2 seconds
    ]
  }
};