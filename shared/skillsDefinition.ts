// Direct definitions without imports
export type SkillId = 'fireball'|'iceBolt'|'waterSplash'|'petrify';
export type SkillType = SkillId;   // export for compatibility
export type SkillCategory = 'projectile'|'instant'|'beam'|'aura';

export type SkillEffectType = 
  | 'damage' 
  | 'stun' 
  | 'slow' 
  | 'dot'    // damage over time
  | 'burn'   // burn damage over time
  | 'poison' // poison damage over time
  | 'waterWeakness' // increases water damage taken
  | 'freeze' 
  | 'transform'; // for stone conversion

export interface SkillEffect {
  type: SkillEffectType;
  value: number; // damage amount, stun duration, slow percentage, etc.
  durationMs?: number; // how long the effect lasts, in ms
}

export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
  icon: string; // Path to icon image
  cat: SkillCategory;
  manaCost: number;     // Mana cost for casting
  castMs: number;       // Time to cast in milliseconds
  cooldownMs: number;   // Cooldown time in milliseconds
  dmg?: number;
  range?: number;       // Maximum range from caster
  speed?: number;       // tiles/sec
  area?: number;        // tile radius
  levelRequired: number;
  effects: SkillEffect[];
  requiresTarget?: boolean; // Whether the skill requires a target to be cast
  projectile?: { 
    speed: number;      // Speed of projectile in units per second
    maxRange?: number;  // Maximum travel distance 
    radius?: number;    // Collision radius
    pierce?: boolean;   // Can hit multiple targets
    splashRadius?: number; // Area of effect radius on impact
    hitRadius?: number;  // Explicit hit detection radius
    maxPierceHits?: number; // Maximum number of targets that can be hit with pierce
  };
}

// Define the SKILLS directly
export const SKILLS: Record<SkillId,SkillDef> = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    description: 'Launches a ball of fire that deals damage and applies a burn effect',
    icon: '/game/skills/skill_fireball.png',
    cat: 'projectile',
    manaCost: 20,
    castMs: 300,
    cooldownMs: 500,
    dmg: 150,
    range: 1800,
    speed: 22,
    levelRequired: 1,
    effects: [
      { type: 'damage', value: 150 },
      { type: 'burn', value: 1, durationMs: 5000 } // 5 seconds
    ],
    projectile: {
      speed: 22,
      pierce: false,
      hitRadius: 1.0
    }
  },
  iceBolt: {
    id: 'iceBolt',
    name: 'Ice Bolt',
    description: 'Fires a bolt of ice that poisons enemies and slows their movement',
    icon: '/game/skills/skill_icebolt.png',
    cat: 'projectile',
    manaCost: 15,
    castMs: 500,
    cooldownMs: 3000,
    dmg: 30,
    range: 1800,
    speed: 26,
    levelRequired: 3,
    effects: [
      { type: 'damage', value: 30 },
      { type: 'poison', value: 0.5, durationMs: 10000 }, // Poisons enemy for 0.5% damage for 10 seconds
      { type: 'slow', value: 50, durationMs: 10000 } // Slows enemy by 50% for 10 seconds
    ],
    projectile: {
      speed: 26,
      pierce: true,
      maxPierceHits: 2,
      hitRadius: 0.8
    }
  },
  waterSplash: {
    id: 'waterSplash',
    name: 'Water Splash',
    description: 'Creates a splash of water that damages enemies and slows them down',
    icon: '/game/skills/skill_water.png',
    cat: 'projectile',
    manaCost: 25,
    castMs: 1500,
    cooldownMs: 8000,
    dmg: 20,
    range: 1500,
    speed: 20,
    area: 3,
    levelRequired: 2,
    effects: [
      { type: 'damage', value: 20 },
      { type: 'waterWeakness', value: 30, durationMs: 5000 } // Makes enemy take 30% more damage from water attacks
    ],
    projectile: {
      speed: 20,
      pierce: false,
      splashRadius: 3,
      hitRadius: 1.2
    }
  },
  petrify: {
    id: 'petrify',
    name: 'Petrify',
    description: 'Temporarily stuns an enemy, preventing them from moving or attacking',
    icon: '/game/skills/skill_petrify.png',
    cat: 'instant',
    manaCost: 40,
    castMs: 2000,
    cooldownMs: 15000,
    dmg: 10,
    range: 1000,
    levelRequired: 4,
    effects: [
      { type: 'damage', value: 10 },
      { type: 'stun', value: 100, durationMs: 2000 } // Stuns enemy completely for 2 seconds
    ]
  }
};
