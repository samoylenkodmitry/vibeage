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
    tags: ['attribute', 'offensive', 'physical'],
  },
  dex: {
    id: 'dex', short: 'DEX', name: 'Dexterity',
    description: 'Attack speed, accuracy, and evasion. Ranged classes lean on it.',
    tags: ['attribute', 'offensive', 'defensive', 'physical'],
  },
  con: {
    id: 'con', short: 'CON', name: 'Constitution',
    description: 'Maximum HP and HP regen. Higher CON = larger health pool.',
    tags: ['attribute', 'defensive'],
  },
  int: {
    id: 'int', short: 'INT', name: 'Intellect',
    description: 'Magical attack power. Scales every spell damage number.',
    tags: ['attribute', 'offensive', 'magical'],
  },
  wit: {
    id: 'wit', short: 'WIT', name: 'Wit',
    description: 'Cast speed and crit chance. Reduces cast time bars.',
    tags: ['attribute', 'offensive', 'utility'],
  },
  men: {
    id: 'men', short: 'MEN', name: 'Mental Strength',
    description: 'Maximum MP and MP regen. Higher MEN = longer sustained casting.',
    tags: ['attribute', 'utility', 'magical'],
  },
  // PR II — derived combat stats. Engine reads these off
  // PlayerState.stats; this entry exists so the wiki Stats tab and
  // the HUD chip can share one description per key. Single source.
  pAtk: {
    id: 'pAtk', short: 'P.Atk', name: 'Physical Attack',
    description: 'Final physical attack power after STR, equipment, and class scaling. Drives every melee + ranged swing.',
    tags: ['derived', 'offensive', 'physical'],
  },
  mAtk: {
    id: 'mAtk', short: 'M.Atk', name: 'Magical Attack',
    description: 'Final magical attack power after INT, equipment, and class scaling. Drives every spell number.',
    tags: ['derived', 'offensive', 'magical'],
  },
  pDef: {
    id: 'pDef', short: 'P.Def', name: 'Physical Defense',
    description: 'Reduces incoming physical damage. Higher P.Def = less damage from melee swings, arrows, knockback.',
    tags: ['derived', 'defensive', 'physical'],
  },
  mDef: {
    id: 'mDef', short: 'M.Def', name: 'Magical Defense',
    description: 'Reduces incoming magical damage. Higher M.Def = less damage from spells and DoT effects.',
    tags: ['derived', 'defensive', 'magical'],
  },
  hpRegen: {
    id: 'hpRegen', short: 'HP/s', name: 'HP Regen',
    description: 'Health restored per second while alive. CON, gear, and bless effects scale it.',
    tags: ['derived', 'defensive'],
  },
  mpRegen: {
    id: 'mpRegen', short: 'MP/s', name: 'MP Regen',
    description: 'Mana restored per second. MEN and gear scale it; meditation buffs stack on top.',
    tags: ['derived', 'utility', 'magical'],
  },
  accuracy: {
    id: 'accuracy', short: 'Acc', name: 'Accuracy',
    description: 'Chance to land an attack. DEX-driven; opposed by the target\'s Evasion.',
    tags: ['derived', 'offensive', 'physical'],
  },
  evasion: {
    id: 'evasion', short: 'Evd', name: 'Evasion',
    description: 'Chance to dodge incoming physical attacks. DEX-driven; opposed by the attacker\'s Accuracy.',
    tags: ['derived', 'defensive', 'physical'],
  },
  attackSpeed: {
    id: 'attackSpeed', short: 'Atk Spd', name: 'Attack Speed',
    description: 'Swings per minute multiplier. DEX-driven; higher = faster auto-attack cadence.',
    tags: ['derived', 'offensive', 'physical'],
  },
  castSpeed: {
    id: 'castSpeed', short: 'Cast Spd', name: 'Cast Speed',
    description: 'Cast-time multiplier. WIT-driven; higher = shorter cast bars on every spell.',
    tags: ['derived', 'offensive', 'magical'],
  },
  runSpeed: {
    id: 'runSpeed', short: 'Speed', name: 'Run Speed',
    description: 'Movement speed in world units / second. Race profile + DEX scale it.',
    tags: ['derived', 'utility'],
  },
  critChance: {
    id: 'critChance', short: 'Crit %', name: 'Critical Chance',
    description: 'Probability that an attack scores a critical hit. WIT and equipment scale it.',
    tags: ['derived', 'offensive'],
  },
};

export const STAT_IDS: readonly string[] = Object.keys(STATS);
