// Direct definitions without imports
export type SkillId =
  | 'basicAttack'
  | 'fireball'|'iceBolt'|'waterSplash'|'petrify'
  | 'slash'|'powerStrike'|'shieldWall'|'taunt'|'bash'
  | 'holyLight'|'bless'|'dispel'|'smite'|'divineShield'
  | 'arrowShot'|'volley'|'rapidFire'
  | 'evade'|'backstab'|'poisonBlade'|'vanish';

/**
 * Skills every player has from birth, regardless of class. Used to make
 * sure normalizeUnlockedSkills + ensureClassStarterUnlocked don't strip
 * the universal Basic Attack on class change or hydrate. Keep this in
 * sync with the SKILLS catalog.
 */
export const UNIVERSAL_SKILLS: readonly SkillId[] = ['basicAttack'];
export type SkillCategory = 'projectile'|'instant'|'beam'|'aura';

export type SkillEffectType =
  | 'damage'
  | 'heal'
  | 'stun'
  | 'slow'
  | 'dot'    // damage over time
  | 'burn'   // burn damage over time
  | 'poison' // poison damage over time
  | 'waterWeakness' // increases water damage taken
  | 'freeze'
  | 'shield'   // damage absorption
  | 'bless'    // damage / hit buff
  | 'dispel'   // remove negative effects
  | 'taunt'    // forced aggro
  | 'knockback'
  | 'evasion'  // dodge buff
  | 'invisible'
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
  basicAttack: {
    id: 'basicAttack',
    name: 'Attack',
    description: 'Strike the target with your equipped weapon (or fists).',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    manaCost: 0,
    castMs: 0,
    cooldownMs: 1200,
    // Damage scales through caster.dmgMult, which already factors in
    // primary stat + equipped weapon pAtk via derivePlayerStats. A
    // small flat base keeps unarmed viable while letting weapons
    // multiply through dmgMult.
    dmg: 8,
    range: 4,
    levelRequired: 1,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 8 },
    ],
  },
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
  },
  slash: {
    id: 'slash',
    name: 'Slash',
    description: 'A quick melee strike that bleeds the target',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    manaCost: 4,
    castMs: 200,
    cooldownMs: 600,
    dmg: 60,
    range: 4,
    levelRequired: 1,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 60 },
      { type: 'dot', value: 5, durationMs: 4000 },
    ],
  },
  powerStrike: {
    id: 'powerStrike',
    name: 'Power Strike',
    description: 'A heavy two-handed swing that knocks the target back',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    manaCost: 18,
    castMs: 800,
    cooldownMs: 6000,
    dmg: 220,
    range: 4,
    levelRequired: 5,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 220 },
      { type: 'knockback', value: 6, durationMs: 200 },
    ],
  },
  shieldWall: {
    id: 'shieldWall',
    name: 'Shield Wall',
    description: 'Brace your shield to absorb a portion of incoming damage',
    icon: '/game/skills/skill_defense.svg',
    cat: 'aura',
    manaCost: 20,
    castMs: 0,
    cooldownMs: 30000,
    levelRequired: 7,
    effects: [
      { type: 'shield', value: 250, durationMs: 8000 },
    ],
  },
  taunt: {
    id: 'taunt',
    name: 'Taunt',
    description: 'Force a target to attack you',
    icon: '/game/skills/skill_defense.svg',
    cat: 'instant',
    manaCost: 12,
    castMs: 200,
    cooldownMs: 12000,
    range: 12,
    levelRequired: 3,
    requiresTarget: true,
    effects: [
      { type: 'taunt', value: 1, durationMs: 5000 },
    ],
  },
  bash: {
    id: 'bash',
    name: 'Bash',
    description: 'Slam the target with your shield, stunning them briefly',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    manaCost: 14,
    castMs: 400,
    cooldownMs: 9000,
    dmg: 90,
    range: 4,
    levelRequired: 4,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 90 },
      { type: 'stun', value: 1, durationMs: 1500 },
    ],
  },
  holyLight: {
    id: 'holyLight',
    name: 'Holy Light',
    description: 'Bathe yourself in light, restoring health',
    icon: '/game/skills/skill_holy.svg',
    cat: 'instant',
    manaCost: 25,
    castMs: 1500,
    cooldownMs: 4000,
    levelRequired: 1,
    effects: [
      { type: 'heal', value: 200 },
    ],
  },
  bless: {
    id: 'bless',
    name: 'Bless',
    description: 'Boost your damage and hit chance for a short time',
    icon: '/game/skills/skill_holy.svg',
    cat: 'aura',
    manaCost: 18,
    castMs: 800,
    cooldownMs: 20000,
    levelRequired: 4,
    effects: [
      { type: 'bless', value: 25, durationMs: 12000 },
    ],
  },
  dispel: {
    id: 'dispel',
    name: 'Dispel',
    description: 'Remove negative status effects from yourself',
    icon: '/game/skills/skill_holy.svg',
    cat: 'instant',
    manaCost: 30,
    castMs: 600,
    cooldownMs: 25000,
    levelRequired: 6,
    effects: [
      { type: 'dispel', value: 1 },
    ],
  },
  smite: {
    id: 'smite',
    name: 'Smite',
    description: 'Hammer of holy energy that damages and briefly stuns the target',
    icon: '/game/skills/skill_holy.svg',
    cat: 'instant',
    manaCost: 22,
    castMs: 700,
    cooldownMs: 5000,
    dmg: 140,
    range: 14,
    levelRequired: 3,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 140 },
      { type: 'stun', value: 1, durationMs: 1000 },
    ],
  },
  divineShield: {
    id: 'divineShield',
    name: 'Divine Shield',
    description: 'A radiant ward absorbs a large amount of incoming damage',
    icon: '/game/skills/skill_defense.svg',
    cat: 'aura',
    manaCost: 35,
    castMs: 0,
    cooldownMs: 60000,
    levelRequired: 5,
    effects: [
      { type: 'shield', value: 500, durationMs: 6000 },
    ],
  },
  arrowShot: {
    id: 'arrowShot',
    name: 'Arrow Shot',
    description: 'A swift arrow that pierces lightly armored foes',
    icon: '/game/skills/skill_ranged.svg',
    cat: 'projectile',
    manaCost: 5,
    castMs: 400,
    cooldownMs: 800,
    dmg: 70,
    range: 22,
    speed: 36,
    levelRequired: 1,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 70 },
    ],
    projectile: { speed: 36, hitRadius: 0.6, pierce: false },
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    description: 'Loose three arrows that pierce through their targets',
    icon: '/game/skills/skill_ranged.svg',
    cat: 'projectile',
    manaCost: 28,
    castMs: 1200,
    cooldownMs: 12000,
    dmg: 80,
    range: 22,
    speed: 32,
    levelRequired: 5,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 80 },
    ],
    projectile: { speed: 32, hitRadius: 0.7, pierce: true, maxPierceHits: 3 },
  },
  rapidFire: {
    id: 'rapidFire',
    name: 'Rapid Fire',
    description: 'Increase your attack speed for a short burst',
    icon: '/game/skills/skill_ranged.svg',
    cat: 'aura',
    manaCost: 20,
    castMs: 0,
    cooldownMs: 30000,
    levelRequired: 7,
    effects: [
      { type: 'bless', value: 40, durationMs: 8000 },
    ],
  },
  evade: {
    id: 'evade',
    name: 'Evade',
    description: 'Boost your dodge chance briefly',
    icon: '/game/skills/skill_stealth.svg',
    cat: 'aura',
    manaCost: 12,
    castMs: 0,
    cooldownMs: 15000,
    levelRequired: 1,
    effects: [
      { type: 'evasion', value: 50, durationMs: 4000 },
    ],
  },
  backstab: {
    id: 'backstab',
    name: 'Backstab',
    description: 'A deadly strike from behind for massive damage',
    icon: '/game/skills/skill_stealth.svg',
    cat: 'instant',
    manaCost: 22,
    castMs: 250,
    cooldownMs: 8000,
    dmg: 320,
    range: 3,
    levelRequired: 3,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 320 },
    ],
  },
  poisonBlade: {
    id: 'poisonBlade',
    name: 'Poison Blade',
    description: 'Coat your blades, leaving lingering poison on hit',
    icon: '/game/skills/skill_stealth.svg',
    cat: 'instant',
    manaCost: 18,
    castMs: 250,
    cooldownMs: 6000,
    dmg: 50,
    range: 3,
    levelRequired: 5,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 50 },
      { type: 'poison', value: 8, durationMs: 8000 },
    ],
  },
  vanish: {
    id: 'vanish',
    name: 'Vanish',
    description: 'Disappear from sight, breaking enemy aggro',
    icon: '/game/skills/skill_stealth.svg',
    cat: 'aura',
    manaCost: 30,
    castMs: 0,
    cooldownMs: 60000,
    levelRequired: 7,
    effects: [
      { type: 'invisible', value: 1, durationMs: 6000 },
    ],
  },
};
