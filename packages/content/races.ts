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
   * Relative-to-1.0 multipliers applied on top of the class weights when
   * derivePlayerStats walks STR/DEX/CON/INT/WIT/MEN. 1.0 = neutral.
   */
  statMultipliers: RaceStatWeights;
};

export const RACE_PROFILES: Record<CharacterRace, RaceProfile> = {
  human: {
    race: 'human',
    name: 'Human',
    description: 'Balanced and adaptable. No clear specialty, no real weakness.',
    statMultipliers: { str: 1.0, dex: 1.0, con: 1.0, int: 1.0, wit: 1.0, men: 1.0 },
  },
  elf: {
    race: 'elf',
    name: 'Elf',
    description: 'Graceful and quick-witted. Higher dexterity and wit, lower constitution.',
    statMultipliers: { str: 0.95, dex: 1.15, con: 0.92, int: 1.05, wit: 1.15, men: 1.0 },
  },
  dark_elf: {
    race: 'dark_elf',
    name: 'Dark Elf',
    description: 'Sharp minds, sharper blades. Strong INT and DEX, frail body.',
    statMultipliers: { str: 1.0, dex: 1.15, con: 0.9, int: 1.18, wit: 1.05, men: 0.95 },
  },
  orc: {
    race: 'orc',
    name: 'Orc',
    description: 'Hardy and powerful. Excellent STR and CON, poor at magic.',
    statMultipliers: { str: 1.2, dex: 0.95, con: 1.18, int: 0.85, wit: 0.9, men: 0.95 },
  },
  dwarf: {
    race: 'dwarf',
    name: 'Dwarf',
    description: 'Resilient and patient. Great CON and MEN, modest DEX.',
    statMultipliers: { str: 1.1, dex: 0.9, con: 1.2, int: 0.95, wit: 0.95, men: 1.15 },
  },
};

export const DEFAULT_RACE: CharacterRace = 'human';
