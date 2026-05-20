import type { CharacterClass } from './classes.js';

export type CharacterRace = 'human' | 'elf' | 'dark_elf' | 'orc' | 'dwarf';

export const CHARACTER_RACES: readonly CharacterRace[] = ['human', 'elf', 'dark_elf', 'orc', 'dwarf'];

export type RaceStatWeights = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wit: number;
  men: number;
};

export type RaceProfile = {
  race: CharacterRace;
  name: string;
  description: string;
  /**
   * Base STR/DEX/CON/INT/WIT/MEN at level 1. Race owns these — class no
   * longer multiplies them (per the "race=base attrs, class=passive
   * skills, equipment=passive skills" architecture). The values below
   * are tuned so each race has clear strengths/weaknesses while staying
   * in a comparable total budget (~75-80 points).
   */
  baseAttrs: RaceStatWeights;
  /**
   * Per-level growth of each attribute. Also race-owned: an orc gains
   * STR faster than a dark_elf does, regardless of class. Class
   * differentiation happens through passive skills that multiply
   * derived combat stats — see ROADMAP Section 8 L520.
   */
  growthPerLevel: RaceStatWeights;
  /**
   * Which base classes this race may select. Lineage-style heritage
   * gating: a player picks a race first, then a class from that
   * race's list. UI hides + server rejects out-of-list picks.
   *
   * Current allocation makes every class race-unique except 'warrior',
   * which is shared between orc + dwarf (the two "physical" races).
   * Strict 1:1 needs +2 base classes (orc berserker, dwarf warsmith);
   * that's a content-expansion PR.
   */
  allowedClasses: readonly CharacterClass[];
};

export const RACE_PROFILES: Record<CharacterRace, RaceProfile> = {
  human: {
    race: 'human',
    name: 'Human',
    description: 'Balanced and adaptable. No clear specialty, no real weakness.',
    baseAttrs: { str: 13, dex: 13, con: 13, int: 13, wit: 13, men: 13 },
    growthPerLevel: { str: 1.5, dex: 1.5, con: 1.5, int: 1.5, wit: 1.5, men: 1.5 },
    allowedClasses: ['knight', 'paladin', 'mage'],
  },
  elf: {
    race: 'elf',
    name: 'Elf',
    description: 'Graceful and quick-witted. Higher dexterity and wit, lower constitution.',
    baseAttrs: { str: 12, dex: 16, con: 11, int: 14, wit: 16, men: 13 },
    growthPerLevel: { str: 1.3, dex: 1.8, con: 1.2, int: 1.6, wit: 1.8, men: 1.5 },
    allowedClasses: ['ranger', 'healer'],
  },
  dark_elf: {
    race: 'dark_elf',
    name: 'Dark Elf',
    description: 'Sharp minds, sharper blades. Strong INT and DEX, frail body.',
    baseAttrs: { str: 13, dex: 16, con: 11, int: 17, wit: 14, men: 12 },
    growthPerLevel: { str: 1.5, dex: 1.8, con: 1.2, int: 1.9, wit: 1.6, men: 1.4 },
    allowedClasses: ['rogue', 'mage'],
  },
  orc: {
    race: 'orc',
    name: 'Orc',
    description: 'Hardy and powerful. Excellent STR and CON, poor at magic.',
    baseAttrs: { str: 17, dex: 12, con: 17, int: 10, wit: 11, men: 12 },
    growthPerLevel: { str: 2.0, dex: 1.3, con: 1.9, int: 1.0, wit: 1.2, men: 1.4 },
    allowedClasses: ['warrior'],
  },
  dwarf: {
    race: 'dwarf',
    name: 'Dwarf',
    description: 'Resilient and patient. Great CON and MEN, modest DEX.',
    baseAttrs: { str: 15, dex: 11, con: 17, int: 12, wit: 12, men: 16 },
    growthPerLevel: { str: 1.7, dex: 1.2, con: 1.9, int: 1.3, wit: 1.3, men: 1.7 },
    allowedClasses: ['warrior', 'healer'],
  },
};

/**
 * True if `className` is in the race's allowedClasses list. The server
 * uses this to gate class picks; the client uses it to hide buttons.
 */
export function isClassAllowedForRace(race: CharacterRace, className: CharacterClass): boolean {
  return RACE_PROFILES[race]?.allowedClasses.includes(className) ?? false;
}

/**
 * §49/M2 — readable strength / weakness summary for the lobby's
 * character-create form. Picks the top-2 attributes and the bottom
 * attribute relative to the race's own average; flat races (human)
 * fall back to "balanced" so we don't lie about a tendency that
 * isn't there.
 */
export type RaceStatTendency = {
  strong: ReadonlyArray<keyof RaceStatWeights>;
  weak: ReadonlyArray<keyof RaceStatWeights>;
  balanced: boolean;
};

export function getRaceStatTendency(race: CharacterRace): RaceStatTendency {
  const profile = RACE_PROFILES[race];
  if (!profile) return { strong: [], weak: [], balanced: true };
  const entries = Object.entries(profile.baseAttrs) as Array<[keyof RaceStatWeights, number]>;
  const values = entries.map(([, v]) => v);
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max - min < 2) return { strong: [], weak: [], balanced: true };
  const strong = entries.filter(([, v]) => v >= max - 1).map(([k]) => k);
  const weak = entries.filter(([, v]) => v <= min + 0.5).map(([k]) => k);
  return { strong, weak, balanced: false };
}

export const DEFAULT_RACE: CharacterRace = 'human';
