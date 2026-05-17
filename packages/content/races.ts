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
   * @deprecated Kept temporarily so the persistence row deserialiser
   * doesn't reject pre-refactor records. New code reads baseAttrs +
   * growthPerLevel instead. Remove after the persisted shape catches
   * up on the next migration.
   */
  statMultipliers: RaceStatWeights;
};

export const RACE_PROFILES: Record<CharacterRace, RaceProfile> = {
  human: {
    race: 'human',
    name: 'Human',
    description: 'Balanced and adaptable. No clear specialty, no real weakness.',
    baseAttrs: { str: 13, dex: 13, con: 13, int: 13, wit: 13, men: 13 },
    growthPerLevel: { str: 1.5, dex: 1.5, con: 1.5, int: 1.5, wit: 1.5, men: 1.5 },
    statMultipliers: { str: 1.0, dex: 1.0, con: 1.0, int: 1.0, wit: 1.0, men: 1.0 },
  },
  elf: {
    race: 'elf',
    name: 'Elf',
    description: 'Graceful and quick-witted. Higher dexterity and wit, lower constitution.',
    baseAttrs: { str: 12, dex: 16, con: 11, int: 14, wit: 16, men: 13 },
    growthPerLevel: { str: 1.3, dex: 1.8, con: 1.2, int: 1.6, wit: 1.8, men: 1.5 },
    statMultipliers: { str: 0.95, dex: 1.15, con: 0.92, int: 1.05, wit: 1.15, men: 1.0 },
  },
  dark_elf: {
    race: 'dark_elf',
    name: 'Dark Elf',
    description: 'Sharp minds, sharper blades. Strong INT and DEX, frail body.',
    baseAttrs: { str: 13, dex: 16, con: 11, int: 17, wit: 14, men: 12 },
    growthPerLevel: { str: 1.5, dex: 1.8, con: 1.2, int: 1.9, wit: 1.6, men: 1.4 },
    statMultipliers: { str: 1.0, dex: 1.15, con: 0.9, int: 1.18, wit: 1.05, men: 0.95 },
  },
  orc: {
    race: 'orc',
    name: 'Orc',
    description: 'Hardy and powerful. Excellent STR and CON, poor at magic.',
    baseAttrs: { str: 17, dex: 12, con: 17, int: 10, wit: 11, men: 12 },
    growthPerLevel: { str: 2.0, dex: 1.3, con: 1.9, int: 1.0, wit: 1.2, men: 1.4 },
    statMultipliers: { str: 1.2, dex: 0.95, con: 1.18, int: 0.85, wit: 0.9, men: 0.95 },
  },
  dwarf: {
    race: 'dwarf',
    name: 'Dwarf',
    description: 'Resilient and patient. Great CON and MEN, modest DEX.',
    baseAttrs: { str: 15, dex: 11, con: 17, int: 12, wit: 12, men: 16 },
    growthPerLevel: { str: 1.7, dex: 1.2, con: 1.9, int: 1.3, wit: 1.3, men: 1.7 },
    statMultipliers: { str: 1.1, dex: 0.9, con: 1.2, int: 0.95, wit: 0.95, men: 1.15 },
  },
};

export const DEFAULT_RACE: CharacterRace = 'human';
