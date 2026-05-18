/**
 * Player attribute catalog — pure data. The Wiki Stats tab renders
 * one row per entry, and the PlayerPanel stat labels link into it.
 * Engine doesn't *consume* this — derivePlayerStats reads the
 * numeric weights from RACE_PROFILES — but it's the canonical
 * player-facing explanation of what each stat does.
 *
 * Adding a new stat = append an entry here.
 */
export interface StatDef {
  id: string;
  short: string;
  name: string;
  /** Two-line player-facing description of the stat's effect. */
  description: string;
  /** Comma-separated tags so future grouping (offensive/defensive/utility) is easy. */
  tags?: readonly string[];
}

export const STATS: Record<string, StatDef> = {
  str: {
    id: 'str', short: 'STR', name: 'Strength',
    description: 'Physical attack power. Boosts every weapon swing and most melee skills.',
    tags: ['offensive', 'physical'],
  },
  dex: {
    id: 'dex', short: 'DEX', name: 'Dexterity',
    description: 'Attack speed, accuracy, and evasion. Ranged classes lean on it.',
    tags: ['offensive', 'defensive', 'physical'],
  },
  con: {
    id: 'con', short: 'CON', name: 'Constitution',
    description: 'Maximum HP and HP regen. Higher CON = larger health pool.',
    tags: ['defensive'],
  },
  int: {
    id: 'int', short: 'INT', name: 'Intellect',
    description: 'Magical attack power. Scales every spell damage number.',
    tags: ['offensive', 'magical'],
  },
  wit: {
    id: 'wit', short: 'WIT', name: 'Wit',
    description: 'Cast speed and crit chance. Reduces cast time bars.',
    tags: ['offensive', 'utility'],
  },
  men: {
    id: 'men', short: 'MEN', name: 'Mental Strength',
    description: 'Maximum MP and MP regen. Higher MEN = longer sustained casting.',
    tags: ['utility', 'magical'],
  },
};

export const STAT_IDS: readonly string[] = Object.keys(STATS);
