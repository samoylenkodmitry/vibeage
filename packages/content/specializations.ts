import type { CharacterClass } from './classes.js';

/**
 * Each base class branches into two specializations the player can
 * pick at SPECIALIZATION_UNLOCK_LEVEL. The chosen spec applies an
 * additional passive (stacked on top of the base CLASS_PASSIVES one)
 * and gates access to spec-only skills. At PROFICIENCY_LEVEL the
 * player gets a second passive layer + the spec's proficiency skills.
 *
 * This file is pure data — the engine reads it. Adding a new spec
 * means appending an entry here; no code changes elsewhere.
 */
export const SPECIALIZATION_UNLOCK_LEVEL = 20;
export const PROFICIENCY_LEVEL = 40;

export type SpecializationId =
  // mage
  | 'arcanist' | 'pyromancer'
  // warrior
  | 'berserker' | 'slayer'
  // healer
  | 'cardinal' | 'theurge'
  // ranger
  | 'hawkeye' | 'phantom_ranger'
  // knight
  | 'templar_knight' | 'dark_avenger'
  // paladin
  | 'phoenix_knight' | 'evas_templar'
  // rogue
  | 'treasure_hunter' | 'plains_walker';

export interface SpecializationPassiveModifiers {
  damageMultiplier?: number;
  healthMultiplier?: number;
  manaMultiplier?: number;
  speedMultiplier?: number;
  critChanceBonus?: number;
  critMultBonus?: number;
}

export interface SpecializationPassive {
  name: string;
  description: string;
  modifiers: SpecializationPassiveModifiers;
}

export interface Specialization {
  id: SpecializationId;
  baseClass: CharacterClass;
  name: string;
  description: string;
  /** Level at which the player can pick this spec. */
  unlockLevel: number;
  /** Level at which the proficiency passive + extra skills unlock. */
  proficiencyLevel: number;
  /** Applied once spec is chosen. */
  specializationPassive: SpecializationPassive;
  /** Applied once player reaches proficiencyLevel. */
  proficiencyPassive: SpecializationPassive;
}

export const SPECIALIZATIONS: Record<SpecializationId, Specialization> = {
  // ---- MAGE ----
  arcanist: {
    id: 'arcanist',
    baseClass: 'mage',
    name: 'Arcanist',
    description: 'Pure-arcane caster — longer range, deeper mana pool, raw spell damage.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Arcane Focus II',
      description: '+15% magical damage, +10% max mana.',
      modifiers: { damageMultiplier: 1.15, manaMultiplier: 1.1 },
    },
    proficiencyPassive: {
      name: 'Wellspring',
      description: 'An additional +15% max mana on top of the spec passive.',
      modifiers: { manaMultiplier: 1.15 },
    },
  },
  pyromancer: {
    id: 'pyromancer',
    baseClass: 'mage',
    name: 'Pyromancer',
    description: 'Fire-focused caster — burn effects tick harder and longer.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Kindling',
      description: '+20% damage on fire effects.',
      modifiers: { damageMultiplier: 1.1 },
    },
    proficiencyPassive: {
      name: 'Conflagration',
      description: 'Fire dot ticks last longer (proficiency tier).',
      modifiers: { damageMultiplier: 1.1 },
    },
  },
  // ---- WARRIOR ----
  berserker: {
    id: 'berserker',
    baseClass: 'warrior',
    name: 'Berserker',
    description: 'Rage-driven striker — higher damage, less defense.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Bloodlust',
      description: '+20% physical damage, +5% crit chance.',
      modifiers: { damageMultiplier: 1.2, critChanceBonus: 0.05 },
    },
    proficiencyPassive: {
      name: 'Frenzy',
      description: 'Higher crit multiplier when below half health (proficiency).',
      modifiers: { critMultBonus: 0.5 },
    },
  },
  slayer: {
    id: 'slayer',
    baseClass: 'warrior',
    name: 'Slayer',
    description: 'Precise weapon master — surgical strikes, sustained damage.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Precision',
      description: '+10% crit chance, +10% physical damage.',
      modifiers: { damageMultiplier: 1.1, critChanceBonus: 0.1 },
    },
    proficiencyPassive: {
      name: 'Executioner',
      description: '+0.5× crit multiplier (proficiency).',
      modifiers: { critMultBonus: 0.5 },
    },
  },
  // ---- HEALER ----
  cardinal: {
    id: 'cardinal',
    baseClass: 'healer',
    name: 'Cardinal',
    description: 'Pure healer — every heal is more potent and shields stick longer.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Greater Calling',
      description: '+25% effective healing output.',
      modifiers: { damageMultiplier: 1.0 },
    },
    proficiencyPassive: {
      name: 'Sanctity',
      description: 'Allies near you regenerate faster (proficiency).',
      modifiers: { healthMultiplier: 1.05 },
    },
  },
  theurge: {
    id: 'theurge',
    baseClass: 'healer',
    name: 'Theurge',
    description: 'Buff-focused support — longer Bless, stronger party multipliers.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Inspiration',
      description: 'Bless / buff effect duration +25%.',
      modifiers: {},
    },
    proficiencyPassive: {
      name: 'Patron Saint',
      description: 'Party-wide aura: +5% damage to nearby allies (proficiency).',
      modifiers: {},
    },
  },
  // ---- RANGER ----
  hawkeye: {
    id: 'hawkeye',
    baseClass: 'ranger',
    name: 'Hawkeye',
    description: 'Precision archer — longer range, sharper crits.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Eagle Eye',
      description: '+15% bow damage, +10% crit chance.',
      modifiers: { damageMultiplier: 1.15, critChanceBonus: 0.1 },
    },
    proficiencyPassive: {
      name: 'Snipe',
      description: 'Crit multiplier +0.5× on ranged attacks (proficiency).',
      modifiers: { critMultBonus: 0.5 },
    },
  },
  phantom_ranger: {
    id: 'phantom_ranger',
    baseClass: 'ranger',
    name: 'Phantom Ranger',
    description: 'Stealth-leaning archer — poison ticks and evasion focus.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Venom',
      description: 'Poison ticks +30%.',
      modifiers: {},
    },
    proficiencyPassive: {
      name: 'Phantom Step',
      description: '+10% movement speed and +5% evasion (proficiency).',
      modifiers: { speedMultiplier: 1.1 },
    },
  },
  // ---- KNIGHT ----
  templar_knight: {
    id: 'templar_knight',
    baseClass: 'knight',
    name: 'Templar Knight',
    description: 'Pure tank — shield uptime, taunt range, max HP.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Bulwark',
      description: '+15% max HP, taunt range +50%.',
      modifiers: { healthMultiplier: 1.15 },
    },
    proficiencyPassive: {
      name: 'Last Stand',
      description: '+15% damage reduction at low HP (proficiency).',
      modifiers: {},
    },
  },
  dark_avenger: {
    id: 'dark_avenger',
    baseClass: 'knight',
    name: 'Dark Avenger',
    description: 'Offensive defender — damage scales with defense, life-steal flavour.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Vengeance',
      description: '+10% physical damage, +10% max HP.',
      modifiers: { damageMultiplier: 1.1, healthMultiplier: 1.1 },
    },
    proficiencyPassive: {
      name: 'Sanguine Blade',
      description: 'Hits restore a small amount of HP (proficiency).',
      modifiers: {},
    },
  },
  // ---- PALADIN ----
  phoenix_knight: {
    id: 'phoenix_knight',
    baseClass: 'paladin',
    name: 'Phoenix Knight',
    description: 'Offensive paladin — divine damage and burn synergy.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Holy Fire',
      description: '+15% magical damage on holy attacks.',
      modifiers: { damageMultiplier: 1.15 },
    },
    proficiencyPassive: {
      name: 'Resurrection',
      description: 'Brief invulnerability on falling to 1 HP, once per fight (proficiency).',
      modifiers: {},
    },
  },
  evas_templar: {
    id: 'evas_templar',
    baseClass: 'paladin',
    name: "Eva's Templar",
    description: 'Healing paladin — group heals, defensive buffs.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Grace',
      description: '+20% healing output, +10% max HP.',
      modifiers: { healthMultiplier: 1.1 },
    },
    proficiencyPassive: {
      name: 'Aegis',
      description: 'Divine Shield refreshes faster (proficiency).',
      modifiers: {},
    },
  },
  // ---- ROGUE ----
  treasure_hunter: {
    id: 'treasure_hunter',
    baseClass: 'rogue',
    name: 'Treasure Hunter',
    description: 'Utility rogue — better loot, faster movement.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Light Step',
      description: '+15% movement speed, +5% evasion.',
      modifiers: { speedMultiplier: 1.15 },
    },
    proficiencyPassive: {
      name: 'Lucky Find',
      description: 'Improved loot drop rates (proficiency).',
      modifiers: {},
    },
  },
  plains_walker: {
    id: 'plains_walker',
    baseClass: 'rogue',
    name: 'Plains Walker',
    description: 'Combat rogue — poison stacks, backstab focus.',
    unlockLevel: SPECIALIZATION_UNLOCK_LEVEL,
    proficiencyLevel: PROFICIENCY_LEVEL,
    specializationPassive: {
      name: 'Toxin',
      description: 'Poison ticks +25%, +10% physical damage.',
      modifiers: { damageMultiplier: 1.1 },
    },
    proficiencyPassive: {
      name: 'Shadow Step',
      description: 'Vanish cooldown halved (proficiency).',
      modifiers: {},
    },
  },
};

export function getSpecializationsForClass(className: CharacterClass): Specialization[] {
  return (Object.values(SPECIALIZATIONS) as Specialization[]).filter((s) => s.baseClass === className);
}

export function getSpecializationById(id: string): Specialization | undefined {
  return SPECIALIZATIONS[id as SpecializationId];
}
