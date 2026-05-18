// Direct definitions without imports
export type SkillId =
  | 'basicAttack'
  | 'escape'
  | 'fireball'|'iceBolt'|'waterSplash'|'petrify'
  | 'slash'|'powerStrike'|'shieldWall'|'taunt'|'bash'
  | 'holyLight'|'bless'|'dispel'|'smite'|'divineShield'
  | 'arrowShot'|'volley'|'rapidFire'
  | 'evade'|'backstab'|'poisonBlade'|'vanish'
  // Spec skills (unlocked at SPECIALIZATION_UNLOCK_LEVEL = Lv 20)
  | 'arcane_blast'|'meteor'
  | 'rage'|'execute'
  | 'greater_heal'|'empower'
  | 'snipe'|'silent_step'
  | 'holy_shield'|'shadow_strike'
  | 'phoenix_ward'|'sacred_pulse'
  | 'lucky_strike'|'wind_dash'
  // Proficiency skills (unlocked at PROFICIENCY_LEVEL = Lv 40)
  | 'arcane_supremacy'|'inferno_aura'
  | 'blood_frenzy'|'killing_strike'
  | 'mass_heal'|'group_bless'
  | 'aimed_volley'|'shadow_arrow'
  | 'divine_taunt'|'soul_eater'
  | 'rebirth'|'sacred_aura'
  | 'treasure_sense'|'stalking_arrow';

/**
 * Skills every player has from birth, regardless of class. Used to make
 * sure normalizeUnlockedSkills + ensureClassStarterUnlocked don't strip
 * the universal Basic Attack on class change or hydrate. Keep this in
 * sync with the SKILLS catalog.
 */
export const UNIVERSAL_SKILLS: readonly SkillId[] = ['basicAttack', 'escape'];
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
  | 'transform' // for stone conversion
  | 'teleport'; // recall to nearest village (Escape)

/**
 * PR X — friendly-fire gate classification. Used to decide whether
 * a skill targeting an enemy / friendly player is sensible by
 * default. Derived from the skill's own effects (no per-skill
 * hardcoding): if any effect is in HARMFUL_EFFECTS the skill is
 * harmful; else if any is in BENEFICIAL_EFFECTS it's beneficial;
 * else neutral (no gate). Force-cast with Ctrl bypasses the gate.
 */
const HARMFUL_EFFECTS: ReadonlySet<SkillEffectType> = new Set([
  'damage', 'dot', 'burn', 'poison', 'stun', 'slow', 'freeze', 'taunt', 'knockback', 'waterWeakness',
]);
const BENEFICIAL_EFFECTS: ReadonlySet<SkillEffectType> = new Set([
  'heal', 'shield', 'bless', 'dispel', 'evasion', 'invisible',
]);

export type SkillAlignment = 'harmful' | 'beneficial' | 'neutral';

export function classifySkill(effects: readonly { type: SkillEffectType }[]): SkillAlignment {
  for (const e of effects) if (HARMFUL_EFFECTS.has(e.type)) return 'harmful';
  for (const e of effects) if (BENEFICIAL_EFFECTS.has(e.type)) return 'beneficial';
  return 'neutral';
}

export interface SkillEffect {
  type: SkillEffectType;
  value: number; // damage amount, stun duration, slow percentage, etc.
  durationMs?: number; // how long the effect lasts, in ms
}

/**
 * Damage flavour. Drives client UX (auto-attack after a physical
 * weapon swing) and could later affect mitigation, resistances, and
 * VFX. 'utility' covers buffs/heals/etc. with no damage flavour.
 */
export type SkillKind = 'physical' | 'magical' | 'utility';

export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
  icon: string; // Path to icon image
  cat: SkillCategory;
  /**
   * Damage flavour: physical (sword/bow/punch), magical (spells),
   * utility (buffs/heals/dispels with no inherent damage type).
   * Default 'magical' for backwards compat when unset.
   */
  kind?: SkillKind;
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
  /**
   * When true, the client keeps re-casting this skill at the same
   * target on each cooldown tick until the player gives a new order.
   * Today only Basic Attack opts in so it behaves like an auto-swing.
   */
  autoRepeat?: boolean;
  /**
   * Optional list of per-level upgrades. Players spend a skill point
   * to advance a skill they already own to the next tier. Each entry
   * states what the upgrade does + the numeric modifiers the engine
   * applies. Engine-driven (no per-skill conditionals): the runtime
   * looks up the player's level for the skill and multiplies / adds
   * the modifier values during cast resolution.
   */
  upgrades?: SkillUpgrade[];
  /**
   * While the cast bar is running, block other player actions
   * (movement, other casts). Defaults to true — set false for
   * instant skills or skills that mechanically allow movement.
   * Server enforcement: castMachine rejects MoveIntent / CastReq
   * while a blocking cast is active for that caster.
   */
  isBlocking?: boolean;
  /**
   * A conflicting action during this cast cancels it. When true:
   * mana cost is refunded, cooldown is NOT applied, the cast just
   * disappears. When false: nothing the player does cancels it
   * (Escape and similar locked recall channels would set false).
   * Defaults to true.
   */
  isInterruptable?: boolean;
}

/**
 * Per-level upgrade entry for a skill. Level 1 is the base skill;
 * upgrade level 2 applies the first entry's modifiers, etc.
 */
export interface SkillUpgrade {
  /** Upgrade tier the player reaches (2, 3, 4...). Cumulative. */
  level: number;
  /** Player-facing one-liner; the wiki + skill tree show this. */
  description: string;
  /** Numeric tweaks applied on top of the base skill at this tier. */
  modifiers: SkillUpgradeModifiers;
}

export interface SkillUpgradeModifiers {
  /** Multiply skill.dmg (and every 'damage' effect). e.g. 1.2 = +20% dmg. */
  dmgMultiplier?: number;
  /** Multiply cooldownMs. e.g. 0.8 = 20% faster cooldown. */
  cooldownMultiplier?: number;
  /** Add to skill.range. */
  rangeBonus?: number;
  /** Multiply manaCost. e.g. 0.8 = 20% less mana. */
  manaCostMultiplier?: number;
  /** Multiply every effect's durationMs (DoT length, slow length, etc.). */
  durationMultiplier?: number;
}

import { SPEC_AND_PROFICIENCY_SKILLS } from './specSkillsData.js';

// Define the base SKILLS catalog. Spec / proficiency skill entries
// live in specSkillsData.ts (kept separate to stay under the
// maintainability gate); they are spread in at module load right
// below, so the final SKILLS record covers every SkillId.
const BASE_SKILLS: Partial<Record<SkillId, SkillDef>> = {
  basicAttack: {
    id: 'basicAttack',
    name: 'Attack',
    description: 'Strike the target with your equipped weapon (or fists).',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    kind: 'physical',
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
    autoRepeat: true,
    effects: [
      { type: 'damage', value: 8 },
    ],
  },
  escape: {
    id: 'escape',
    name: 'Escape',
    description: 'Channel for 30 seconds, then teleport back to the nearest safe village.',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    kind: 'utility',
    manaCost: 0,
    castMs: 30_000,
    cooldownMs: 30 * 60 * 1000,
    levelRequired: 1,
    effects: [
      // Engine reads effect.type === 'teleport' on the caster in
      // applySkillEffects and routes them to getNearestVillage. value
      // is unused; durationMs is irrelevant (the teleport is instant
      // on impact resolution after the 30s channel).
      { type: 'teleport', value: 0 },
    ],
  },
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    description: 'Launches a ball of fire that deals damage and applies a burn effect',
    icon: '/game/skills/skill_fireball.png',
    cat: 'projectile',
    kind: 'magical',
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
    },
    upgrades: [
      { level: 2, description: '+15% damage', modifiers: { dmgMultiplier: 1.15 } },
      { level: 3, description: '+15% damage and 20% faster cooldown', modifiers: { dmgMultiplier: 1.15, cooldownMultiplier: 0.8 } },
      { level: 4, description: 'Burn lasts 50% longer', modifiers: { durationMultiplier: 1.5 } },
    ],
  },
  iceBolt: {
    id: 'iceBolt',
    name: 'Ice Bolt',
    description: 'Fires a bolt of ice that poisons enemies and slows their movement',
    icon: '/game/skills/skill_icebolt.png',
    cat: 'projectile',
    kind: 'magical',
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
    kind: 'magical',
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
    kind: 'magical',
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
    kind: 'physical',
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
    upgrades: [
      { level: 2, description: '+20% damage', modifiers: { dmgMultiplier: 1.2 } },
      { level: 3, description: 'Bleed lasts twice as long', modifiers: { durationMultiplier: 2.0 } },
      { level: 4, description: '+25% damage and -1 mana cost', modifiers: { dmgMultiplier: 1.25, manaCostMultiplier: 0.75 } },
    ],
  },
  powerStrike: {
    id: 'powerStrike',
    name: 'Power Strike',
    description: 'A heavy two-handed swing that knocks the target back',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    kind: 'physical',
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
    kind: 'utility',
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
    kind: 'utility',
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
    kind: 'physical',
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
    kind: 'utility',
    manaCost: 25,
    castMs: 1500,
    cooldownMs: 4000,
    levelRequired: 1,
    effects: [
      { type: 'heal', value: 200 },
    ],
    upgrades: [
      { level: 2, description: '+30% heal', modifiers: { dmgMultiplier: 1.3 } },
      { level: 3, description: '30% faster cast', modifiers: { cooldownMultiplier: 0.7 } },
      { level: 4, description: 'Costs 25% less mana', modifiers: { manaCostMultiplier: 0.75 } },
    ],
  },
  bless: {
    id: 'bless',
    name: 'Bless',
    description: 'Boost your damage and hit chance for a short time',
    icon: '/game/skills/skill_holy.svg',
    cat: 'aura',
    kind: 'utility',
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
    kind: 'utility',
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
    kind: 'magical',
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
    kind: 'utility',
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
    description: 'A swift arrow with a wide impact that pierces lightly armored foes',
    icon: '/game/skills/skill_ranged.svg',
    cat: 'projectile',
    kind: 'physical',
    manaCost: 0,
    castMs: 400,
    cooldownMs: 800,
    dmg: 60,
    range: 22,
    speed: 36,
    // Wider splash so the bow plays more like a wide-radius ranged
    // auto-attack. autoRepeat keeps the ranger "auto-shooting" like
    // Basic Attack does for melee.
    //
    // NOTE: pierce / maxPierceHits aren't read by the server's
    // projectile runtime yet (a pre-existing gap also affecting
    // volley). Splash via skill.area above already gives the wide
    // feel; pierce lands in a follow-up.
    area: 2.5,
    autoRepeat: true,
    levelRequired: 1,
    requiresTarget: true,
    effects: [
      { type: 'damage', value: 60 },
    ],
    projectile: { speed: 36, hitRadius: 0.9, splashRadius: 2.5 },
    upgrades: [
      { level: 2, description: '+20% damage', modifiers: { dmgMultiplier: 1.2 } },
      { level: 3, description: 'Wider splash (+1m)', modifiers: { rangeBonus: 1 } },
      { level: 4, description: '20% faster cooldown', modifiers: { cooldownMultiplier: 0.8 } },
    ],
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    description: 'Loose three arrows that pierce through their targets',
    icon: '/game/skills/skill_ranged.svg',
    cat: 'projectile',
    kind: 'physical',
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
    kind: 'utility',
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
    kind: 'utility',
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
    kind: 'physical',
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
    kind: 'physical',
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
    kind: 'utility',
    manaCost: 30,
    castMs: 0,
    cooldownMs: 60000,
    levelRequired: 7,
    effects: [
      { type: 'invisible', value: 1, durationMs: 6000 },
    ],
  },
};

/**
 * Final SKILLS catalog: base skills merged with spec / proficiency
 * skills. The merge is content-only — adding a new skill just means
 * a new entry in BASE_SKILLS or specSkillsData.ts.
 *
 * Cast through unknown to Record<SkillId, SkillDef> because the
 * spread is structurally exhaustive but TypeScript can't prove it
 * (Partial + Partial → Partial). The specSkillGate.spec.ts coverage
 * test asserts every SkillId resolves to a SkillDef at runtime.
 */
export const SKILLS = {
  ...BASE_SKILLS,
  ...SPEC_AND_PROFICIENCY_SKILLS,
} as unknown as Record<SkillId, SkillDef>;
