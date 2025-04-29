import { SKILLS as SHARED_SKILLS, SkillId } from '../../../shared/skillsDefinition';

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
    damage: SHARED_SKILLS.fireball.dmg,
    manaCost: SHARED_SKILLS.fireball.manaCost,
    cooldownMs: SHARED_SKILLS.fireball.cooldownMs,
    range: SHARED_SKILLS.fireball.range || 15,
    levelRequired: 1,
    castTimeMs: SHARED_SKILLS.fireball.castMs,
    projectileSpeed: SHARED_SKILLS.fireball.speed,
    effects: [
      { type: 'damage', value: SHARED_SKILLS.fireball.dmg || 20 },
      { type: 'burn', value: 1, durationMs: 5000 } // 5 seconds
    ]
  },
  'waterSplash': {
    id: 'waterSplash',
    name: 'Water Splash',
    description: 'Creates a splash of water that damages enemies and slows them down',
    icon: '/skills/water.png',
    damage: SHARED_SKILLS.waterSplash.dmg,
    manaCost: SHARED_SKILLS.waterSplash.manaCost,
    cooldownMs: SHARED_SKILLS.waterSplash.cooldownMs,
    range: SHARED_SKILLS.waterSplash.range || 10,
    areaOfEffect: SHARED_SKILLS.waterSplash.area || 20, 
    levelRequired: 2,
    castTimeMs: SHARED_SKILLS.waterSplash.castMs,
    effects: [
      { type: 'damage', value: SHARED_SKILLS.waterSplash.dmg || 15 },
      { type: 'waterWeakness', value: 30, durationMs: 5000 } // Makes enemy take 30% more damage from water attacks
    ]
  },
  'icebolt': {
    id: 'icebolt',
    name: 'Ice Bolt',
    description: 'Fires a bolt of ice that poisons enemies and slows their movement',
    icon: '/skills/icebolt.png',
    damage: SHARED_SKILLS.iceBolt.dmg,
    manaCost: SHARED_SKILLS.iceBolt.manaCost,
    cooldownMs: SHARED_SKILLS.iceBolt.cooldownMs,
    range: SHARED_SKILLS.iceBolt.range || 12,
    levelRequired: 3,
    castTimeMs: SHARED_SKILLS.iceBolt.castMs,
    projectileSpeed: SHARED_SKILLS.iceBolt.speed,
    effects: [
      { type: 'damage', value: SHARED_SKILLS.iceBolt.dmg || 25 },
      { type: 'poison', value: 0.5, durationMs: 10000 }, // Poisons enemy for 0.5% damage for 10 seconds
      { type: 'slow', value: 50, durationMs: 10000 } // Slows enemy by 50% for 10 seconds
    ]
  },
  'petrify': {
    id: 'petrify',
    name: 'Petrify',
    description: 'Temporarily stuns an enemy, preventing them from moving or attacking',
    icon: '/skills/petrify.png',
    damage: SHARED_SKILLS.petrify.dmg,
    manaCost: SHARED_SKILLS.petrify.manaCost,
    cooldownMs: SHARED_SKILLS.petrify.cooldownMs,
    range: SHARED_SKILLS.petrify.range || 8,
    levelRequired: 4,
    castTimeMs: SHARED_SKILLS.petrify.castMs,
    projectileSpeed: SHARED_SKILLS.petrify.speed,
    effects: [
      { type: 'damage', value: SHARED_SKILLS.petrify.dmg || 20 },
      { type: 'stun', value: 100, durationMs: 2000 } // Stuns enemy completely for 2 seconds
    ]
  }
};