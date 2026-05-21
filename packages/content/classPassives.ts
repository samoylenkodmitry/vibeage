import type { CharacterClass } from './classes.js';
import type { SkillCategory, SkillDef, SkillId } from './skills.js';
import type { Contribution } from '../sim/statContributions.js';

/**
 * PR PP — Class passives are *passive skills* the player owns.
 *
 * Two flavours:
 *   - **Auto-granted**: every class owns one passive the moment they
 *     are that class. Added to `starterSkillsFor(className)` so it
 *     appears in `unlockedSkills` from spawn / hydration.
 *   - **Learnable**: a small set of additional passives surfaced in
 *     the skill tree the player can spend skill points on.
 *
 * Both feed the same `PASSIVE_SKILL_CONTRIBUTIONS` registry, which
 * the stat-Contribution engine consults via
 * `pushPassiveSkillContributions(out, player.unlockedSkills)`. There
 * is no "class is a multiplier" code path — class is a tree of
 * allowed skills, exactly per the design.
 */

// ---------------------------------------------------------- ids per class

/**
 * Auto-granted passive: one per class, owned the moment a character
 * picks that class. Matches today's CLASS_PASSIVES[id] for the
 * single-passive case.
 */
export const CLASS_AUTO_PASSIVE_SKILL: Record<CharacterClass, SkillId> = {
  mage: 'passive_arcane_focus',
  warrior: 'passive_battle_hardened',
  healer: 'passive_serenity',
  ranger: 'passive_woodland_step',
  knight: 'passive_iron_discipline',
  paladin: 'passive_oath_of_light',
  rogue: 'passive_shadow_strike',
};

/**
 * Learnable passive skill IDs per class (two each). Surfaced in the
 * class skill tree at sensible levels so players spend skill points
 * to unlock them. Numbers tuned conservatively.
 */
export const CLASS_LEARNABLE_PASSIVE_SKILLS: Record<CharacterClass, readonly SkillId[]> = {
  warrior: ['passive_toughness', 'passive_brutality'],
  mage: ['passive_focus_mind', 'passive_arcane_potency'],
  healer: ['passive_serene_mind', 'passive_warding'],
  ranger: ['passive_keen_eye', 'passive_swift_step'],
  knight: ['passive_armor_training', 'passive_iron_grip'],
  paladin: ['passive_holy_aegis', 'passive_radiant_focus'],
  rogue: ['passive_shadow_grace', 'passive_lethal_focus'],
};

// ---------------------------------------------------------- skill defs

const PASSIVE_BASE: Pick<SkillDef, 'manaCost' | 'castMs' | 'cooldownMs' | 'kind' | 'effects' | 'isBlocking'> = {
  manaCost: 0,
  castMs: 0,
  cooldownMs: 0,
  kind: 'utility',
  effects: [],
  isBlocking: false,
};

const PASSIVE_CAT: SkillCategory = 'aura';

/**
 * SkillDef entries for every passive. Cast / cooldown are zero — a
 * passive isn't a cast; merely owning the skill activates its
 * contribution rows. Surfacing it in the skill tree gives the
 * player something concrete to spend a skill point on.
 */
export const PASSIVE_SKILLS: Record<SkillId, SkillDef> = {
  // Auto-granted per class.
  passive_arcane_focus: {
    id: 'passive_arcane_focus', name: 'Arcane Focus',
    description: 'Channeling magic comes naturally. +20% damage, +30% mana, lighter step (−10% speed body cost).',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 1, ...PASSIVE_BASE,
  },
  passive_battle_hardened: {
    id: 'passive_battle_hardened', name: 'Battle Hardened',
    description: 'Years of melee make the body tougher and the blade heavier. +30% HP, +10% damage, −30% mana.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 1, ...PASSIVE_BASE,
  },
  passive_serenity: {
    id: 'passive_serenity', name: 'Serenity',
    description: 'A focused mind sustains a deep mana pool at the cost of physical force. +20% mana, −20% damage.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 1, ...PASSIVE_BASE,
  },
  passive_woodland_step: {
    id: 'passive_woodland_step', name: 'Woodland Step',
    description: 'Light footing and a quick draw — moves faster, hits harder. +20% speed, +10% damage.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 1, ...PASSIVE_BASE,
  },
  passive_iron_discipline: {
    id: 'passive_iron_discipline', name: 'Iron Discipline',
    description: 'Hold the line. Massive health pool but slower in heavy plate. +45% HP, −40% mana, −5% speed.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 1, ...PASSIVE_BASE,
  },
  passive_oath_of_light: {
    id: 'passive_oath_of_light', name: 'Oath of Light',
    description: 'Balanced martial and holy power. +20% HP.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 1, ...PASSIVE_BASE,
  },
  passive_shadow_strike: {
    id: 'passive_shadow_strike', name: 'Shadow Strike',
    description: 'Frail but devastatingly fast — quick movement, sharper blade. +25% damage, +25% speed.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 1, ...PASSIVE_BASE,
  },
  // Learnable per class — modest, paired with the starter passive.
  passive_toughness: {
    id: 'passive_toughness', name: 'Toughness',
    description: 'Hardened body. +5% maximum HP.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 5, ...PASSIVE_BASE,
  },
  passive_brutality: {
    id: 'passive_brutality', name: 'Brutality',
    description: 'Every swing lands heavier. +8% physical attack.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 8, ...PASSIVE_BASE,
  },
  passive_focus_mind: {
    id: 'passive_focus_mind', name: 'Focus Mind',
    description: 'Deeper mana reserves. +5% maximum MP.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 5, ...PASSIVE_BASE,
  },
  passive_arcane_potency: {
    id: 'passive_arcane_potency', name: 'Arcane Potency',
    description: 'Spells hit sharper. +8% magical attack.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 8, ...PASSIVE_BASE,
  },
  passive_serene_mind: {
    id: 'passive_serene_mind', name: 'Serene Mind',
    description: 'Mana flows back faster. +10% MP regen.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 5, ...PASSIVE_BASE,
  },
  passive_warding: {
    id: 'passive_warding', name: 'Warding',
    description: 'Wraps you in a thin veil. +5% magical defense.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 8, ...PASSIVE_BASE,
  },
  passive_keen_eye: {
    id: 'passive_keen_eye', name: 'Keen Eye',
    description: 'Sees the chink in the armor. +5% accuracy.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 5, ...PASSIVE_BASE,
  },
  passive_swift_step: {
    id: 'passive_swift_step', name: 'Swift Step',
    description: 'Lighter on the feet. +5% movement speed.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 8, ...PASSIVE_BASE,
  },
  passive_armor_training: {
    id: 'passive_armor_training', name: 'Armor Training',
    description: 'Years of drill in heavy plate. +10% physical defense.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 5, ...PASSIVE_BASE,
  },
  passive_iron_grip: {
    id: 'passive_iron_grip', name: 'Iron Grip',
    description: 'Sword bites deeper. +5% physical attack.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 8, ...PASSIVE_BASE,
  },
  passive_holy_aegis: {
    id: 'passive_holy_aegis', name: 'Holy Aegis',
    description: 'A faint divine ward. +5% maximum HP.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 5, ...PASSIVE_BASE,
  },
  passive_radiant_focus: {
    id: 'passive_radiant_focus', name: 'Radiant Focus',
    description: 'Holy magic strikes truer. +5% magical attack.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 8, ...PASSIVE_BASE,
  },
  passive_shadow_grace: {
    id: 'passive_shadow_grace', name: 'Shadow Grace',
    description: 'Slips between blows. +5% evasion.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 5, ...PASSIVE_BASE,
  },
  passive_lethal_focus: {
    id: 'passive_lethal_focus', name: 'Lethal Focus',
    description: 'Knows exactly where to strike. +5% critical chance.',
    icon: '/game/skills/skill_aura.svg', cat: PASSIVE_CAT, levelRequired: 8, ...PASSIVE_BASE,
  },
} as unknown as Record<SkillId, SkillDef>;

// ---------------------------------------------------------- contributions

/**
 * Stat impact per passive. The Contribution registry in
 * packages/sim/statContributions.ts reads this when building the
 * player's contributions list. Source ids are stable + match the
 * popup label conventions.
 */
export const PASSIVE_SKILL_CONTRIBUTIONS: Record<SkillId, readonly Contribution[]> = {
  // Auto-granted.
  passive_arcane_focus: [
    { source: 'skill:passive_arcane_focus:hp', label: 'Arcane Focus (HP)', stat: 'maxHealth', op: 'mul', value: 0.8 },
    { source: 'skill:passive_arcane_focus:mp', label: 'Arcane Focus (MP)', stat: 'maxMana', op: 'mul', value: 1.3 },
    { source: 'skill:passive_arcane_focus:dmg', label: 'Arcane Focus (dmg)', stat: 'dmgMult', op: 'mul', value: 1.2 },
    { source: 'skill:passive_arcane_focus:spd', label: 'Arcane Focus (speed)', stat: 'runSpeed', op: 'mul', value: 0.9 },
  ],
  passive_battle_hardened: [
    { source: 'skill:passive_battle_hardened:hp', label: 'Battle Hardened (HP)', stat: 'maxHealth', op: 'mul', value: 1.3 },
    { source: 'skill:passive_battle_hardened:mp', label: 'Battle Hardened (MP)', stat: 'maxMana', op: 'mul', value: 0.7 },
    { source: 'skill:passive_battle_hardened:dmg', label: 'Battle Hardened (dmg)', stat: 'dmgMult', op: 'mul', value: 1.1 },
  ],
  passive_serenity: [
    { source: 'skill:passive_serenity:hp', label: 'Serenity (HP)', stat: 'maxHealth', op: 'mul', value: 0.9 },
    { source: 'skill:passive_serenity:mp', label: 'Serenity (MP)', stat: 'maxMana', op: 'mul', value: 1.2 },
    { source: 'skill:passive_serenity:dmg', label: 'Serenity (dmg)', stat: 'dmgMult', op: 'mul', value: 0.8 },
  ],
  passive_woodland_step: [
    { source: 'skill:passive_woodland_step:hp', label: 'Woodland Step (HP)', stat: 'maxHealth', op: 'mul', value: 0.9 },
    { source: 'skill:passive_woodland_step:dmg', label: 'Woodland Step (dmg)', stat: 'dmgMult', op: 'mul', value: 1.1 },
    { source: 'skill:passive_woodland_step:spd', label: 'Woodland Step (speed)', stat: 'runSpeed', op: 'mul', value: 1.2 },
  ],
  passive_iron_discipline: [
    { source: 'skill:passive_iron_discipline:hp', label: 'Iron Discipline (HP)', stat: 'maxHealth', op: 'mul', value: 1.45 },
    { source: 'skill:passive_iron_discipline:mp', label: 'Iron Discipline (MP)', stat: 'maxMana', op: 'mul', value: 0.6 },
    { source: 'skill:passive_iron_discipline:spd', label: 'Iron Discipline (speed)', stat: 'runSpeed', op: 'mul', value: 0.95 },
  ],
  passive_oath_of_light: [
    { source: 'skill:passive_oath_of_light:hp', label: 'Oath of Light (HP)', stat: 'maxHealth', op: 'mul', value: 1.2 },
  ],
  passive_shadow_strike: [
    { source: 'skill:passive_shadow_strike:hp', label: 'Shadow Strike (HP)', stat: 'maxHealth', op: 'mul', value: 0.9 },
    { source: 'skill:passive_shadow_strike:mp', label: 'Shadow Strike (MP)', stat: 'maxMana', op: 'mul', value: 0.9 },
    { source: 'skill:passive_shadow_strike:dmg', label: 'Shadow Strike (dmg)', stat: 'dmgMult', op: 'mul', value: 1.25 },
    { source: 'skill:passive_shadow_strike:spd', label: 'Shadow Strike (speed)', stat: 'runSpeed', op: 'mul', value: 1.25 },
  ],
  // Learnable — each is a single contribution row, deliberately
  // conservative (5–10% range) so a player who buys all of them
  // still doesn't dwarf their gear.
  passive_toughness: [
    { source: 'skill:passive_toughness', label: 'Toughness', stat: 'maxHealth', op: 'mul', value: 1.05 },
  ],
  passive_brutality: [
    { source: 'skill:passive_brutality', label: 'Brutality', stat: 'pAtk', op: 'mul', value: 1.08 },
  ],
  passive_focus_mind: [
    { source: 'skill:passive_focus_mind', label: 'Focus Mind', stat: 'maxMana', op: 'mul', value: 1.05 },
  ],
  passive_arcane_potency: [
    { source: 'skill:passive_arcane_potency', label: 'Arcane Potency', stat: 'mAtk', op: 'mul', value: 1.08 },
  ],
  passive_serene_mind: [
    { source: 'skill:passive_serene_mind', label: 'Serene Mind', stat: 'mpRegen', op: 'mul', value: 1.1 },
  ],
  passive_warding: [
    { source: 'skill:passive_warding', label: 'Warding', stat: 'mDef', op: 'mul', value: 1.05 },
  ],
  passive_keen_eye: [
    { source: 'skill:passive_keen_eye', label: 'Keen Eye', stat: 'accuracy', op: 'mul', value: 1.05 },
  ],
  passive_swift_step: [
    { source: 'skill:passive_swift_step', label: 'Swift Step', stat: 'runSpeed', op: 'mul', value: 1.05 },
  ],
  passive_armor_training: [
    { source: 'skill:passive_armor_training', label: 'Armor Training', stat: 'pDef', op: 'mul', value: 1.1 },
  ],
  passive_iron_grip: [
    { source: 'skill:passive_iron_grip', label: 'Iron Grip', stat: 'pAtk', op: 'mul', value: 1.05 },
  ],
  passive_holy_aegis: [
    { source: 'skill:passive_holy_aegis', label: 'Holy Aegis', stat: 'maxHealth', op: 'mul', value: 1.05 },
  ],
  passive_radiant_focus: [
    { source: 'skill:passive_radiant_focus', label: 'Radiant Focus', stat: 'mAtk', op: 'mul', value: 1.05 },
  ],
  passive_shadow_grace: [
    { source: 'skill:passive_shadow_grace', label: 'Shadow Grace', stat: 'evasion', op: 'mul', value: 1.05 },
  ],
  passive_lethal_focus: [
    { source: 'skill:passive_lethal_focus', label: 'Lethal Focus', stat: 'critChance', op: 'addPre', value: 0.05 },
  ],
} as unknown as Record<SkillId, readonly Contribution[]>;

/**
 * Convenience view used by the Wiki "Classes" + "Tree" tabs to
 * render the class's auto-granted passive name + description.
 * Derived from PASSIVE_SKILLS so the description lives in one
 * place. Numeric stat impact is *not* part of this view — that
 * comes from PASSIVE_SKILL_CONTRIBUTIONS, the single source.
 */
export type ClassPassiveView = { id: SkillId; name: string; description: string };

export const CLASS_PASSIVES: Record<CharacterClass, ClassPassiveView> = Object.fromEntries(
  (Object.entries(CLASS_AUTO_PASSIVE_SKILL) as Array<[CharacterClass, SkillId]>).map(
    ([cls, id]) => {
      const def = PASSIVE_SKILLS[id];
      return [cls, { id, name: def?.name ?? id, description: def?.description ?? '' }];
    },
  ),
) as Record<CharacterClass, ClassPassiveView>;
