// PR UU — `SKILL_IDS` is the canonical list; `SkillId` + the Zod
// schema in `protocol/common.ts` both derive from it.
import { BOSS_SIGNATURE_SKILL_IDS } from './bossSkills.js';
export const SKILL_IDS = [
  'basicAttack', 'escape',
  'fireball', 'iceBolt', 'waterSplash', 'petrify',
  'slash', 'powerStrike', 'shieldWall', 'taunt', 'bash',
  'holyLight', 'bless', 'dispel', 'smite', 'divineShield',
  'arrowShot', 'volley', 'rapidFire',
  'evade', 'backstab', 'poisonBlade', 'vanish',
  // Spec skills (SPECIALIZATION_UNLOCK_LEVEL = Lv 20).
  'arcane_blast', 'meteor', 'rage', 'execute',
  'greater_heal', 'empower', 'snipe', 'silent_step',
  'holy_shield', 'shadow_strike', 'phoenix_ward', 'sacred_pulse',
  'lucky_strike', 'wind_dash',
  // Proficiency skills (PROFICIENCY_LEVEL = Lv 40).
  'arcane_supremacy', 'time_sphere', 'inferno_aura', 'blood_frenzy', 'killing_strike',
  'mass_heal', 'group_bless', 'aimed_volley', 'shadow_arrow',
  'divine_taunt', 'soul_eater', 'spectral_guard', 'rebirth', 'sacred_aura',
  'treasure_sense', 'stalking_arrow', 'dimensional_swap', 'rift_step', 'waygate',
  // PR PP — class passives (auto + learnable).
  'passive_arcane_focus', 'passive_battle_hardened', 'passive_serenity',
  'passive_woodland_step', 'passive_iron_discipline', 'passive_oath_of_light',
  'passive_shadow_strike', 'passive_toughness', 'passive_brutality',
  'passive_focus_mind', 'passive_arcane_potency', 'passive_serene_mind',
  'passive_warding', 'passive_keen_eye', 'passive_swift_step',
  'passive_armor_training', 'passive_iron_grip', 'passive_holy_aegis',
  'passive_radiant_focus', 'passive_shadow_grace', 'passive_lethal_focus',
  // Mob abilities (mobSkills.ts) — owned by enemy templates, never learnable.
  'mobStrike', 'mobPoisonBite', 'mobFirebolt', 'mobFrostbolt', 'mobBreath', 'mobWarbandHowl',
  // Boss signatures (generated defs in bossSkills.ts).
  ...BOSS_SIGNATURE_SKILL_IDS,
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** Skills every player has from birth (normalizeUnlockedSkills /
 *  ensureClassStarterUnlocked keep these on class change / hydrate). */
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
  | 'marked' // target marker consumed by precision follow-ups
  | 'freeze'
  | 'timeStop'
  | 'shield'   // damage absorption
  | 'damageReflect' // reflects a percentage of post-mitigation incoming damage
  | 'bless'    // damage / hit buff
  | 'arcaneCharge' // caster marker consumed by arcane payoffs
  | 'dispel'   // remove negative effects
  | 'taunt'    // forced aggro
  | 'knockback'
  | 'evasion'  // dodge buff
  | 'invisible'
  | 'speed_boost' | 'attackSpeed' | 'reveal_loot' // movement / auto-attack / loot-reveal buffs
  | 'aggroReset' // PR KK — wipe attackers' threat on the caster
  | 'teleport'; // recall to nearest village (Escape)

/** Friendly-fire gate classification, derived from a skill's effects
 *  (harmful if any HARMFUL_EFFECTS, else beneficial if any BENEFICIAL,
 *  else neutral). Ctrl force-cast bypasses it. */
const HARMFUL_EFFECTS: ReadonlySet<SkillEffectType> = new Set([
  'damage', 'dot', 'burn', 'poison', 'stun', 'slow', 'freeze', 'timeStop', 'taunt', 'knockback', 'waterWeakness', 'marked',
]);
const BENEFICIAL_EFFECTS: ReadonlySet<SkillEffectType> = new Set([
  'heal', 'shield', 'damageReflect', 'bless', 'arcaneCharge', 'dispel', 'evasion', 'invisible', 'speed_boost', 'attackSpeed', 'reveal_loot', 'aggroReset',
]);

export type SkillAlignment = 'harmful' | 'beneficial' | 'neutral';

export function classifySkill(effects: readonly { type: SkillEffectType }[]): SkillAlignment {
  for (const e of effects) if (HARMFUL_EFFECTS.has(e.type)) return 'harmful';
  for (const e of effects) if (BENEFICIAL_EFFECTS.has(e.type)) return 'beneficial';
  return 'neutral';
}

/** §52 #10 — dispel target family. Default 'negative' preserves pre-§52 behaviour. Target sets live in `server/combat/statusQueries#dispelTargetSet`. */
export type DispelCategory = 'negative' | 'positive' | 'poison' | 'stun' | 'shield' | 'bleed' | 'magic';
export interface SkillEffect {
  type: SkillEffectType;
  value: number; // damage amount, stun duration, slow percentage, etc.
  durationMs?: number;
  dispelCategory?: DispelCategory; // §52 #10 — only when type==='dispel'.
  healPerRemoved?: number; // §SKILL-REACTIONS — only when type==='dispel'.
}

/** Damage flavour; drives client UX + mitigation kind. 'utility' = no damage. */
export type SkillKind = 'physical' | 'magical' | 'utility';

// §45.4 — optional element flavour. Drives `*Weakness` status
// vulnerability amplifiers in calculateDamage. Unset → neutral.
export type SkillDamageElement = 'fire' | 'water' | 'ice' | 'arcane' | 'holy' | 'shadow' | 'poison';

// §49/M3 PR014 — skill tags. Type aliases live in `./skillTags.ts`
// to keep this file under the maintainability cap; imported then
// re-exported so existing consumers can keep importing from here.
import type {
  SkillRole,
  SkillSchool,
  SkillScalingStat,
  SkillTargetMode,
  SkillPveUse,
  SkillOffense,
} from './skillTags.js';
import type { AbilityShape, AbilityAffects, AbilityTelegraph, SummonSpec, BlinkSpec, SwapSpec } from './abilitySchema.js';
import { withSkillReactions, type SkillReaction } from './skillReactions.js';
export type {
  SkillRole,
  SkillSchool,
  SkillScalingStat,
  SkillTargetMode,
  SkillPveUse,
};

export interface SkillDef {
  id: SkillId;
  name: string;
  description: string;
  icon: string;
  cat: SkillCategory;
  /** Default 'magical' for backwards compat when unset. */
  kind?: SkillKind;
  damageElement?: SkillDamageElement;
  // §49/M3 PR014 — descriptive tags; resolved via getSkillTags().
  role?: SkillRole;
  school?: SkillSchool;
  scalingStat?: SkillScalingStat;
  targetMode?: SkillTargetMode;
  pveUse?: SkillPveUse[];
  designerNotes?: string;
  manaCost: number;     // Mana cost for casting
  castMs: number;       // Time to cast in milliseconds
  cooldownMs: number;   // Cooldown time in milliseconds
  dmg?: number;
  /** Damage base = caster's `stats.attackPower` instead of static `dmg`
   *  (mob strikes; falls back to `dmg` when the caster has no attackPower). */
  weaponScaled?: boolean;
  range?: number;       // Maximum range from caster
  speed?: number;       // tiles/sec
  area?: number;        // tile radius
  levelRequired: number;
  effects: SkillEffect[];
  requiresTarget?: boolean; // Whether the skill requires a target to be cast
  /** PR KK — resolves on the caster regardless of selection (vanish, blink, dispel-self). */
  selfTarget?: boolean;
  projectile?: {
    speed: number;      // Speed of projectile in units per second
    maxRange?: number;  // Maximum travel distance
    radius?: number;    // Collision radius
    pierce?: boolean;   // Can hit multiple targets
    splashRadius?: number; // Area of effect radius on impact
    hitRadius?: number;  // Explicit hit detection radius
    maxPierceHits?: number; // Maximum number of targets that can be hit with pierce
  };
  /** Client re-casts at the same target each cooldown until a new order
   *  (Basic Attack opts in for auto-swing behaviour). */
  autoRepeat?: boolean;
  /** Per-level upgrades; modifier values applied during cast resolution. */
  upgrades?: SkillUpgrade[];
  /** Block movement / other casts while the bar runs. Default true. */
  isBlocking?: boolean;
  /** False = locked channel (Escape recall); conflicting actions can't cancel. Default true. */
  isInterruptable?: boolean;
  /** §SKILL-ENGINE B9–B12 — execute / crit / lifesteal / armor-pen modifiers. */
  offense?: SkillOffense;
  // Ability schema (docs/ABILITY_SYSTEM.md) — data-driven geometry,
  // delivery, and caster mechanics; one generic resolver per axis.
  shape?: AbilityShape;          // AOE geometry; absent = single-target
  affects?: AbilityAffects;      // allegiance filter; absent = inferred
  telegraph?: AbilityTelegraph;  // lock origin/dir, resolve after wind-up
  summon?: SummonSpec;           // caster spawns mobs on resolution
  blink?: BlinkSpec;             // caster teleports behind target on resolution
  swap?: SwapSpec;               // caster and target exchange positions on resolution
  customBehavior?: string;       // CUSTOM_SKILL_BEHAVIORS resolver (escape hatch)
  damageMult?: number;           // flat multiplier on the damage base (e.g. 2.4×)
  reactions?: SkillReaction[];   // conditional combo hooks driven by live status effects
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
  /** Multiply skill.dmg plus damage/heal/shield/DoT effect values. e.g. 1.2 = +20%. */
  dmgMultiplier?: number;
  /** Multiply cooldownMs. e.g. 0.8 = 20% faster cooldown. */
  cooldownMultiplier?: number;
  rangeBonus?: number;
  areaBonus?: number;
  /** Multiply manaCost. e.g. 0.8 = 20% less mana. */
  manaCostMultiplier?: number;
  /** Multiply every effect's durationMs (DoT length, slow length, etc.). */
  durationMultiplier?: number;
}

import { SPEC_AND_PROFICIENCY_SKILLS } from './specSkillsData.js';
import { withGeneratedSkillIcons } from './skillIcons.js';
export { skillIconPath } from './skillIcons.js';

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
    // Damage scales through caster.dmgMult (primary stat + weapon pAtk
    // via the Contribution registry); small flat base keeps unarmed viable.
    dmg: 8,
    range: 4,
    levelRequired: 1,
    requiresTarget: true,
    autoRepeat: true,
    // PR Y — instants don't block movement (an auto-swing shouldn't freeze).
    isBlocking: false,
    effects: [
      { type: 'damage', value: 8 },
    ],
  },
  escape: {
    id: 'escape',
    name: 'Escape',
    description: 'Channel for 30 seconds, then teleport back to the nearest safe village. Locked: cannot be interrupted by movement or other actions.',
    icon: '/game/skills/skill_melee.svg',
    cat: 'instant',
    kind: 'utility',
    manaCost: 0,
    castMs: 30_000,
    cooldownMs: 30 * 60 * 1000,
    levelRequired: 1,
    // PR WW — locked recall channel: movement / other casts must
    // not interrupt the 30 s channel ("cast Escape and stayed in
    // place" bug).
    isInterruptable: false,
    effects: [
      // Engine reads effect.type === 'teleport' on the caster in
      // applySkillEffects and routes them to getNearestVillage.
      { type: 'teleport', value: 0 },
    ],
  },
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    description: 'Launches a ball of fire that burns the target. Existing Burn detonates for extra burst before a new Burn is applied.',
    icon: '/game/skills/skill_fireball.png',
    cat: 'projectile',
    kind: 'magical',
    damageElement: 'fire',
    manaCost: 20,
    castMs: 300,
    cooldownMs: 500,
    dmg: 150,
    range: 1800,
    speed: 22,
    levelRequired: 1,
    effects: [{ type: 'damage', value: 150 }, { type: 'burn', value: 1, durationMs: 5000 }],
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
    description: 'Fires a bolt of ice that poisons and slows. Water-vulnerable targets are flash-frozen.',
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
      { type: 'poison', value: 3, durationMs: 10000 },
      { type: 'slow', value: 50, durationMs: 10000 },
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
    description: 'Creates a splash of water that damages enemies and leaves them vulnerable to follow-up water magic',
    icon: '/game/skills/skill_water.png',
    cat: 'instant',
    kind: 'magical',
    // §45.4 — water element so the waterWeakness debuff this same
    // skill applies actually amplifies the follow-up cast.
    damageElement: 'water',
    manaCost: 25,
    castMs: 1500,
    cooldownMs: 8000,
    dmg: 20,
    range: 1500,
    area: 3,
    levelRequired: 2,
    requiresTarget: true,
    effects: [{ type: 'damage', value: 20 }, { type: 'waterWeakness', value: 30, durationMs: 5000 }],
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
    isBlocking: false,
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
    description: 'Slam the target with your shield, stunning them briefly. Bleeding targets are cracked harder.',
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
      { level: 3, description: '30% faster cooldown', modifiers: { cooldownMultiplier: 0.7 } },
      { level: 4, description: 'Costs 25% less mana', modifiers: { manaCostMultiplier: 0.75 } },
    ],
  },
  bless: {
    id: 'bless',
    name: 'Bless',
    description: 'Boost your outgoing damage and accuracy for a short time',
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
    description: 'Remove negative status effects from yourself and recover health for each effect stripped.',
    icon: '/game/skills/skill_holy.svg',
    cat: 'instant',
    kind: 'utility',
    manaCost: 30,
    castMs: 600,
    cooldownMs: 25000,
    levelRequired: 6,
    effects: [{ type: 'dispel', value: 1, healPerRemoved: 60 }],
  },
  smite: {
    id: 'smite',
    name: 'Smite',
    description: 'Hammer of holy energy that damages and briefly stuns the target. Taunted enemies take a punishing judgment.',
    icon: '/game/skills/skill_holy.svg',
    cat: 'instant',
    kind: 'magical',
    damageElement: 'holy',
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
    isBlocking: false,
    effects: [
      { type: 'shield', value: 500, durationMs: 6000 },
    ],
  },
  arrowShot: {
    id: 'arrowShot',
    name: 'Arrow Shot',
    description: 'A swift arrow with a wide impact. It marks the target so heavier shots can cash in the opening.',
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
    // Basic Attack does for melee. §45.5 wired pierce in the
    // projectile runtime — volley's `pierce: true` now lands real
    // multi-target damage.
    area: 2.5,
    autoRepeat: true,
    levelRequired: 1,
    requiresTarget: true,
    effects: [{ type: 'damage', value: 60 }, { type: 'marked', value: 1, durationMs: 8000 }],
    projectile: { speed: 36, hitRadius: 0.9, splashRadius: 2.5 },
    upgrades: [
      { level: 2, description: '+20% damage', modifiers: { dmgMultiplier: 1.2 } },
      { level: 3, description: '+1m range and wider splash', modifiers: { rangeBonus: 1, areaBonus: 1 } },
      { level: 4, description: '20% faster cooldown', modifiers: { cooldownMultiplier: 0.8 } },
    ],
  },
  volley: {
    id: 'volley',
    name: 'Volley',
    description: 'Loose three arrows that pierce through their targets. Marked targets are pinned for a snipe window.',
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
    isBlocking: false,
    effects: [
      { type: 'attackSpeed', value: 40, durationMs: 8000 }, // B6 — was a bless damage buff
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
    isBlocking: false,
    effects: [
      { type: 'evasion', value: 50, durationMs: 4000 },
    ],
  },
  backstab: {
    id: 'backstab',
    name: 'Backstab',
    description: 'A deadly strike from behind. Stealth turns it into an opener, and poison can be cashed out for burst.',
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
    effects: [{ type: 'damage', value: 320 }],
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
    isBlocking: false,
    // PR KK — self-buff. Previously vanish had no `selfTarget` flag,
    // so casting it with a mob selected routed the invisible effect
    // at the mob (and the player kept getting hit). The flag tells
    // the engine + wiki this skill always lands on the caster.
    selfTarget: true,
    effects: [
      { type: 'invisible', value: 1, durationMs: 6000 },
      // PR KK — explicit aggro reset so existing chasers actually
      // forget the player when they vanish. The invisible flag
      // alone doesn't drop the threat list.
      { type: 'aggroReset', value: 1 },
    ],
  },
};

/**
 * Final SKILLS catalog: base + spec/proficiency + passives + mob skills.
 * Cast via unknown; specSkillGate.spec.ts asserts every SkillId resolves.
 */
import { PASSIVE_SKILLS } from './classPassives.js';
import { MOB_SKILLS } from './mobSkills.js';
import { BOSS_SIGNATURE_SKILLS } from './bossSkills.js';
export const SKILLS = withGeneratedSkillIcons(
  withSkillReactions(
    { ...BASE_SKILLS, ...SPEC_AND_PROFICIENCY_SKILLS, ...PASSIVE_SKILLS, ...MOB_SKILLS, ...BOSS_SIGNATURE_SKILLS } as unknown as Record<SkillId, SkillDef>,
  ),
);
export { isPassiveSkill } from './classPassives.js';
