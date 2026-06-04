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
  /**
   * §45.3 follow-up — conditional damage-taken multiplier that
   * applies while the wearer's HP is below 50%. 0.85 here →
   * incoming damage × 0.85 = "+15% damage reduction at low HP".
   * Evaluated live at damage time (not via the stat pipeline)
   * since hpFraction changes between recomputes. Used by Templar
   * Knight `Last Stand`.
   */
  belowHalfHpDamageTakenMultiplier?: number;
  /**
   * §45.3 follow-up — lifesteal as a fraction of damage dealt.
   * 0.05 = 5% of the post-mitigation damage is restored as HP
   * on the caster. Applied per cast hit (so AoE casts heal once
   * per target). Used by Dark Avenger `Sanguine Blade`.
   */
  lifestealPercent?: number;
  /**
   * §45.3 follow-up — multiplier on the durationMs of beneficial
   * status effects the caster applies (bless, evasion, shield,
   * speed_boost, invisible). 1.25 → +25% buff duration. Read in
   * `upsertStatusEffect` via the active spec's modifiers. Used by
   * Theurge `Inspiration`.
   */
  beneficialBuffDurationMultiplier?: number;
  /**
   * §45.3 follow-up — per-skill cooldown multiplier. Keys are
   * SkillIds, values are multipliers on the skill's stored
   * `cooldownMs` (0.5 = halved). Read at cast time in
   * `applySkillCostAndCooldown`. Used by Eva's Templar `Aegis`
   * (Divine Shield) and Plains Walker `Shadow Step` (Vanish).
   * Multiple specs / tiers stack multiplicatively per skill.
   */
  cooldownMultiplierBySkill?: Readonly<Record<string, number>>;
  /**
   * §45.3 follow-up — multiplier on the per-tick `value` of
   * `poison` status effects the caster lands. 1.3 → +30% per
   * tick. Applied at `upsertStatusEffect` so the stored
   * StatusEffect.value already carries the amplified damage;
   * `dotTicker` reads the value verbatim. Used by Phantom Ranger
   * `Venom` (spec) and Plains Walker `Toxin` (spec).
   */
  poisonTickMultiplier?: number;
  /**
   * §45.3 follow-up — multiplier on a loot-table drop's roll
   * chance. 1.5 → every entry's `chance` is multiplied by 1.5
   * (clamped at 1.0). Read in `generateLoot` from the killer's
   * active spec. Used by Treasure Hunter `Lucky Find` (prof).
   */
  lootRateMultiplier?: number;
  /**
   * §45.3 follow-up — damage multiplier scoped to the cast's
   * `damageElement`. Keyed by element id (`fire`, `holy`, etc.);
   * 1.2 → +20% damage on every cast tagged that element. Read in
   * `calculateDamage` so non-matching casts ignore the bonus.
   * Used by Pyromancer (fire) and Phoenix Knight (holy).
   */
  damageElementMultiplier?: Readonly<Record<string, number>>;
  /**
   * §45.3 follow-up — per-skill range multiplier. 1.5 = the
   * caster can land the named skill from 50% further away. Read
   * in `getCastBlocker` when validating cast range. Used by
   * Templar Knight `Bulwark` (Taunt range +50%).
   */
  rangeMultiplierBySkill?: Readonly<Record<string, number>>;
  /**
   * §45.3 follow-up — once-per-life save. When set on a Phoenix
   * Knight, a killing hit instead reduces the player to 1 HP and
   * applies an `invuln` status effect for this many milliseconds.
   * `usedResurrectionThisLife` on PlayerState tracks the one-shot;
   * `respawnPlayer` resets it.
   */
  resurrectionInvulnMs?: number;
  /**
   * §45.3 follow-up — party-wide damage aura. Allies (other
   * players) within `partyDamageAuraRadiusM` of the spec carrier
   * gain `partyDamageAuraMultiplier` on every cast they land.
   * Read live at `calculateDamage` so movement immediately
   * activates / deactivates the buff without a stat recompute.
   * Used by Theurge `Patron Saint`.
   */
  partyDamageAuraMultiplier?: number;
  partyDamageAuraRadiusM?: number;
  /**
   * §45.3 follow-up — party-wide HP regen aura. Allies (other
   * players) within `partyHpRegenAuraRadiusM` of the spec carrier
   * gain a flat `partyHpRegenAuraBonus` HP/sec on top of their
   * own regen, applied at `handleResourceRegeneration` time so
   * the bonus tracks movement without a stat recompute. Used by
   * Cardinal `Sanctity`.
   */
  partyHpRegenAuraBonus?: number;
  partyHpRegenAuraRadiusM?: number;
}

interface SpecializationPassive {
  name: string;
  description: string;
  modifiers: SpecializationPassiveModifiers;
}

export interface Specialization {
  id: SpecializationId;
  baseClass: CharacterClass;
  name: string;
  icon: string;
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

export const SPECIALIZATION_ICON_SLUGS: Record<SpecializationId, string> = {
  arcanist: 'arcanist',
  pyromancer: 'pyromancer',
  berserker: 'berserker',
  slayer: 'slayer',
  cardinal: 'cardinal',
  theurge: 'theurge',
  hawkeye: 'hawkeye',
  phantom_ranger: 'phantom-ranger',
  templar_knight: 'templar-knight',
  dark_avenger: 'dark-avenger',
  phoenix_knight: 'phoenix-knight',
  evas_templar: 'evas-templar',
  treasure_hunter: 'treasure-hunter',
  plains_walker: 'plains-walker',
};

export function specializationIconPath(specId: SpecializationId): string {
  return `/game/specs/spec-icon-${SPECIALIZATION_ICON_SLUGS[specId]}.png`;
}

type SpecializationDef = Omit<Specialization, 'icon'>;

function withGeneratedSpecializationIcons(
  specs: Record<SpecializationId, SpecializationDef>,
): Record<SpecializationId, Specialization> {
  return Object.fromEntries(
    (Object.entries(specs) as Array<[SpecializationId, SpecializationDef]>).map(([specId, spec]) => [
      specId,
      { ...spec, icon: specializationIconPath(specId) },
    ]),
  ) as Record<SpecializationId, Specialization>;
}

const SPECIALIZATION_DEFS: Record<SpecializationId, SpecializationDef> = {
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
    specSkills: ['arcane_blast', 'rewind_mark', 'phase_prison'],
    proficiencySkills: ['arcane_supremacy', 'time_sphere', 'dimensional_swap', 'gravity_well'],
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
      description: '+10% damage; fire-flavour casts hit +20% on top.',
      modifiers: { damageMultiplier: 1.1, damageElementMultiplier: { fire: 1.2 } },
    },
    proficiencyPassive: {
      name: 'Conflagration',
      description: '+10% damage; fire-flavour casts gain another +15%.',
      modifiers: { damageMultiplier: 1.1, damageElementMultiplier: { fire: 1.15 } },
    },
    specSkills: ['meteor', 'magma_chain', 'combustion_bloom'],
    proficiencySkills: ['inferno_aura', 'cataclysm_rings'],
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
    specSkills: ['rage', 'momentum_strike', 'blood_magnet'],
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
    specSkills: ['execute', 'delayed_fate', 'duelist_lunge'],
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
      description: '+5% max HP; nearby allies (within 12m) regen +2 HP/sec.',
      modifiers: { healthMultiplier: 1.05, partyHpRegenAuraBonus: 2, partyHpRegenAuraRadiusM: 12 },
    },
    specSkills: ['greater_heal', 'soul_link', 'lifeline_swap'],
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
      description: 'Bless / buff effects you cast last 25% longer.',
      modifiers: { beneficialBuffDurationMultiplier: 1.25 },
    },
    proficiencyPassive: {
      name: 'Patron Saint',
      description: 'Nearby allies (within 15m) deal +5% damage.',
      modifiers: { partyDamageAuraMultiplier: 1.05, partyDamageAuraRadiusM: 15 },
    },
    specSkills: ['empower', 'mirror_spell', 'echoing_benediction'],
    proficiencySkills: ['group_bless', 'waygate', 'portal_pair'],
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
    specSkills: ['snipe', 'projectile_capture', 'tripwire_volley'],
    proficiencySkills: ['aimed_volley', 'terrain_sigil'],
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
      description: '+30% poison tick damage.',
      modifiers: { poisonTickMultiplier: 1.3 },
    },
    proficiencyPassive: {
      name: 'Phantom Step',
      description: '+10% movement speed, +5 evasion.',
      modifiers: { speedMultiplier: 1.1, evasionBonus: 5 },
    },
    specSkills: ['silent_step', 'phase_step', 'umbra_mine'],
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
      description: '+15% max HP; Taunt range +50%.',
      modifiers: { healthMultiplier: 1.15, rangeMultiplierBySkill: { taunt: 1.5 } },
    },
    proficiencyPassive: {
      name: 'Last Stand',
      description: '15% damage reduction while below half HP.',
      modifiers: { belowHalfHpDamageTakenMultiplier: 0.85 },
    },
    specSkills: ['holy_shield', 'silence_bubble', 'guardian_hook'],
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
      description: 'Each hit restores 5% of the damage dealt as HP.',
      modifiers: { lifestealPercent: 0.05 },
    },
    specSkills: ['shadow_strike', 'reflection_contract', 'vengeance_tether'],
    proficiencySkills: ['soul_eater', 'spectral_guard'],
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
      description: '+15% damage; holy-flavour casts hit +20% on top.',
      modifiers: { damageMultiplier: 1.15, damageElementMultiplier: { holy: 1.2 } },
    },
    proficiencyPassive: {
      name: 'Resurrection',
      description: 'The first killing hit each life leaves you at 1 HP with 2.5s of invulnerability.',
      modifiers: { resurrectionInvulnMs: 2500 },
    },
    specSkills: ['phoenix_ward', 'phoenix_leap', 'sunbreak_charge'],
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
      description: 'Divine Shield cooldown halved.',
      modifiers: { cooldownMultiplierBySkill: { divineShield: 0.5 } },
    },
    specSkills: ['sacred_pulse', 'aegis_relay', 'tidal_barrier'],
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
      description: 'Loot drop chances boosted by 50% (clamped at 100%).',
      modifiers: { lootRateMultiplier: 1.5 },
    },
    specSkills: ['lucky_strike', 'puppet_mastery', 'jackpot_snare'],
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
      description: '+10% damage, +25% poison tick damage.',
      modifiers: { damageMultiplier: 1.1, poisonTickMultiplier: 1.25 },
    },
    proficiencyPassive: {
      name: 'Shadow Step',
      description: 'Vanish cooldown halved.',
      modifiers: { cooldownMultiplierBySkill: { vanish: 0.5 } },
    },
    specSkills: ['wind_dash', 'clone_swap', 'razorwind_step'],
    proficiencySkills: ['stalking_arrow', 'rift_step'],
  },
};

export const SPECIALIZATIONS: Record<SpecializationId, Specialization> = withGeneratedSpecializationIcons(SPECIALIZATION_DEFS);

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
