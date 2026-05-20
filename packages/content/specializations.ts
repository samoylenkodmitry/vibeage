import type { CharacterClass } from './classes.js';
import type { SkillId } from './skills.js';

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
  /**
   * §45.3 follow-up — multiplies the value of `heal` effects the
   * caster lands. 1.25 → +25% effective healing. Read by
   * `applyHealEffect` at impact time via the caster's
   * `player.stats.healMult` (populated through the Contribution
   * registry). Lets healer specs like Cardinal actually deliver
   * the "+25% healing output" their passive description promises.
   */
  healOutputMultiplier?: number;
  /**
   * §45.3 follow-up — flat evasion bonus (rolled into the existing
   * `evasion` stat). +5 here = +5 evasion points on the player's
   * sheet, indistinguishable from a +5 equip bonus. Used by specs
   * with "+5% evasion" copy (Phantom Step, Light Step).
   */
  evasionBonus?: number;
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
  /**
   * Skills unlocked the moment the player picks this spec (Lv 20).
   * Pure data — engine reads SPECIALIZATIONS[id].specSkills to gate
   * learn attempts. Skills themselves live in SKILLS.
   */
  specSkills?: SkillId[];
  /**
   * Additional skills unlocked once the player hits PROFICIENCY_LEVEL
   * (Lv 40). Same gating model as specSkills.
   */
  proficiencySkills?: SkillId[];
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
    specSkills: ['arcane_blast'],
    proficiencySkills: ['arcane_supremacy'],
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
      description: '+10% damage. (planned: fire-flavour amplifier so burn dots tick harder than other damage.)',
      modifiers: { damageMultiplier: 1.1 },
    },
    proficiencyPassive: {
      name: 'Conflagration',
      description: '+10% damage. (planned: fire-dot duration extension.)',
      modifiers: { damageMultiplier: 1.1 },
    },
    specSkills: ['meteor'],
    proficiencySkills: ['inferno_aura'],
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
    specSkills: ['rage'],
    proficiencySkills: ['blood_frenzy'],
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
    specSkills: ['execute'],
    proficiencySkills: ['killing_strike'],
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
      modifiers: { healOutputMultiplier: 1.25 },
    },
    proficiencyPassive: {
      name: 'Sanctity',
      description: '+5% max HP. (planned: nearby-ally regen aura.)',
      modifiers: { healthMultiplier: 1.05 },
    },
    specSkills: ['greater_heal'],
    proficiencySkills: ['mass_heal'],
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
      description: '(planned: +25% Bless / buff effect duration. No status-duration multiplier system today.)',
      modifiers: {},
    },
    proficiencyPassive: {
      name: 'Patron Saint',
      description: '(planned: party-wide aura for +5% damage to nearby allies. No party-aura system today.)',
      modifiers: {},
    },
    specSkills: ['empower'],
    proficiencySkills: ['group_bless'],
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
    specSkills: ['snipe'],
    proficiencySkills: ['aimed_volley'],
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
      description: '(planned: +30% poison tick damage. No poison-tick amplifier today.)',
      modifiers: {},
    },
    proficiencyPassive: {
      name: 'Phantom Step',
      description: '+10% movement speed, +5 evasion.',
      modifiers: { speedMultiplier: 1.1, evasionBonus: 5 },
    },
    specSkills: ['silent_step'],
    proficiencySkills: ['shadow_arrow'],
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
      description: '+15% max HP. (planned: taunt-range +50% once skills can take per-spec range modifiers.)',
      modifiers: { healthMultiplier: 1.15 },
    },
    proficiencyPassive: {
      name: 'Last Stand',
      description: '(planned: +15% damage reduction below half HP. No conditional damage-taken multiplier today.)',
      modifiers: {},
    },
    specSkills: ['holy_shield'],
    proficiencySkills: ['divine_taunt'],
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
      description: '(planned: small per-hit HP restore. No lifesteal hook in applyCastToTarget yet.)',
      modifiers: {},
    },
    specSkills: ['shadow_strike'],
    proficiencySkills: ['soul_eater'],
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
      description: '+15% damage. (planned: holy-flavour amplifier so the bonus only applies to divine attacks.)',
      modifiers: { damageMultiplier: 1.15 },
    },
    proficiencyPassive: {
      name: 'Resurrection',
      description: '(planned: brief invulnerability on falling to 1 HP, once per fight. No once-per-fight tracker yet.)',
      modifiers: {},
    },
    specSkills: ['phoenix_ward'],
    proficiencySkills: ['rebirth'],
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
      modifiers: { healthMultiplier: 1.1, healOutputMultiplier: 1.2 },
    },
    proficiencyPassive: {
      name: 'Aegis',
      description: '(planned: faster Divine Shield refresh. No per-skill cooldown reduction system today.)',
      modifiers: {},
    },
    specSkills: ['sacred_pulse'],
    proficiencySkills: ['sacred_aura'],
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
      description: '+15% movement speed, +5 evasion.',
      modifiers: { speedMultiplier: 1.15, evasionBonus: 5 },
    },
    proficiencyPassive: {
      name: 'Lucky Find',
      description: '(planned: improved loot drop rates. No loot-rate multiplier system today.)',
      modifiers: {},
    },
    specSkills: ['lucky_strike'],
    proficiencySkills: ['treasure_sense'],
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
      description: '+10% damage. (planned: +25% poison tick damage once a poison-tick amplifier lands.)',
      modifiers: { damageMultiplier: 1.1 },
    },
    proficiencyPassive: {
      name: 'Shadow Step',
      description: '(planned: Vanish cooldown halved. No per-skill cooldown reduction system today.)',
      modifiers: {},
    },
    specSkills: ['wind_dash'],
    proficiencySkills: ['stalking_arrow'],
  },
};

/**
 * Lookup helpers used by the engine to gate spec / proficiency
 * skills. Both walk SPECIALIZATIONS so adding a new spec skill is
 * content-only — no code path touches a specific id.
 */
export function getSpecForSkill(skillId: string): { spec: Specialization; tier: 'spec' | 'proficiency' } | null {
  for (const spec of Object.values(SPECIALIZATIONS) as Specialization[]) {
    if (spec.specSkills?.includes(skillId as never)) return { spec, tier: 'spec' };
    if (spec.proficiencySkills?.includes(skillId as never)) return { spec, tier: 'proficiency' };
  }
  return null;
}

export function getSpecializationsForClass(className: CharacterClass): Specialization[] {
  return (Object.values(SPECIALIZATIONS) as Specialization[]).filter((s) => s.baseClass === className);
}

export function getSpecializationById(id: string): Specialization | undefined {
  return SPECIALIZATIONS[id as SpecializationId];
}
