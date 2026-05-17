import type { CharacterClass } from './classes.js';

/**
 * Class passives are the multiplicative buffs each class grants the
 * moment a character belongs to that class. They replace the old
 * `CLASS_SKILL_TREES[c].baseStats` block in spirit — same numbers,
 * but exposed as named passive skills so the design intent stays
 * visible in code, the UI can render them as "skills you have," and
 * future passives (equipment-granted, level-up rewards, set bonuses)
 * compose with them through one shared shape.
 *
 * Architecture note (user-driven): race=base attrs, class=passive
 * skills, equipment=passive skills. This file holds the "class" half.
 */
export type ClassPassive = {
  id: string;
  name: string;
  description: string;
  className: CharacterClass;
  modifiers: {
    healthMultiplier?: number;
    manaMultiplier?: number;
    damageMultiplier?: number;
    speedMultiplier?: number;
  };
};

export const CLASS_PASSIVES: Record<CharacterClass, ClassPassive> = {
  mage: {
    id: 'passive_arcane_focus',
    name: 'Arcane Focus',
    description: 'Channeling magic comes naturally. +20% damage, +30% mana, smaller body.',
    className: 'mage',
    modifiers: { healthMultiplier: 0.8, manaMultiplier: 1.3, damageMultiplier: 1.2, speedMultiplier: 0.9 },
  },
  warrior: {
    id: 'passive_battle_hardened',
    name: 'Battle Hardened',
    description: 'Years of melee make the body tougher and the blade heavier.',
    className: 'warrior',
    modifiers: { healthMultiplier: 1.3, manaMultiplier: 0.7, damageMultiplier: 1.1 },
  },
  healer: {
    id: 'passive_serenity',
    name: 'Serenity',
    description: 'A focused mind sustains a deep mana pool at the cost of physical force.',
    className: 'healer',
    modifiers: { healthMultiplier: 0.9, manaMultiplier: 1.2, damageMultiplier: 0.8 },
  },
  ranger: {
    id: 'passive_woodland_step',
    name: 'Woodland Step',
    description: 'Light footing and a quick draw — moves faster, hits harder.',
    className: 'ranger',
    modifiers: { healthMultiplier: 0.9, damageMultiplier: 1.1, speedMultiplier: 1.2 },
  },
  knight: {
    id: 'passive_iron_discipline',
    name: 'Iron Discipline',
    description: 'Hold the line. Massive health pool but slower in heavy plate.',
    className: 'knight',
    modifiers: { healthMultiplier: 1.45, manaMultiplier: 0.6, speedMultiplier: 0.95 },
  },
  paladin: {
    id: 'passive_oath_of_light',
    name: 'Oath of Light',
    description: 'Balanced martial and holy power.',
    className: 'paladin',
    modifiers: { healthMultiplier: 1.2 },
  },
  rogue: {
    id: 'passive_shadow_strike',
    name: 'Shadow Strike',
    description: 'Frail but devastatingly fast — quick movement, sharper blade.',
    className: 'rogue',
    modifiers: { healthMultiplier: 0.9, manaMultiplier: 0.9, damageMultiplier: 1.25, speedMultiplier: 1.25 },
  },
};

/** Empty modifier set used when an unknown class slips through. */
const EMPTY_MODIFIERS = Object.freeze({});

/**
 * Returns the active passive modifiers for the given class. Equivalent
 * to reading `CLASS_PASSIVES[className].modifiers` with a safe default
 * for unknown class strings.
 */
export function modifiersForClass(className: CharacterClass): ClassPassive['modifiers'] {
  return CLASS_PASSIVES[className]?.modifiers ?? EMPTY_MODIFIERS;
}
