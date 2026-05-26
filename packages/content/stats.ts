/**
 * Player attribute catalog — pure data. The Wiki Stats tab renders
 * one row per entry, and the PlayerPanel stat labels link into it.
 * The Contribution registry in `packages/sim/statContributions.ts`
 * is the engine consumer. This file is the canonical player-facing
 * description of what each stat does (label + description) used by
 * the wiki Stats tab and the HUD stat-row tooltip.
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

/**
 * Hit/dodge model — single source of truth for the numbers the
 * engine applies and the Wiki/HUD describe. Accuracy and Evasion are
 * opposing stats measured from these baselines: a hit's dodge chance
 * is `(targetEvasion − EVASION_BASELINE) − (attackerAccuracy −
 * ACCURACY_BASELINE)` percent, clamped to `[0, MAX_DODGE_CHANCE]`.
 *
 * The baselines are exactly the `baseline:accuracy` / `baseline:evasion`
 * contributions, so an unbuffed attacker (accuracy 90) vs an unbuffed
 * target (evasion 5) lands every hit — no balance shift — and the
 * stats only bite once gear / passives / level gaps move them apart.
 * Evade-style evasion *buffs* add a separate flat dodge % on top.
 */
export const ACCURACY_BASELINE = 90;
export const EVASION_BASELINE = 5;
export const MAX_DODGE_CHANCE = 0.95;

/**
 * Defense model — single source for P.Def / M.Def mitigation. Damage
 * taken is scaled by `DEFENSE_HALF_REDUCTION / (DEFENSE_HALF_REDUCTION
 * + effectiveDefense)`, i.e. a target whose relevant defense equals
 * this constant takes half damage; diminishing returns above it, so
 * defense never zeroes a hit. `effectiveDefense` is the target's
 * P.Def (physical attacks) or M.Def (magical), minus any attacker
 * armor penetration. Tuning lever: raise to make defense gentler,
 * lower to make it stronger. Entities with no defense (mobs) take
 * full damage, so this only softens *incoming* player damage today.
 */
export const DEFENSE_HALF_REDUCTION = 200;

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
  maxHealth: {
    id: 'maxHealth', short: 'Max HP', name: 'Maximum Health',
    description: 'Maximum hit points the player can hold. CON, equipment, and class passives raise it. (Shield buffs add a separate absorb pool, not max HP.)',
    tags: ['derived', 'defensive', 'vital'],
  },
  maxMana: {
    id: 'maxMana', short: 'Max MP', name: 'Maximum Mana',
    description: 'Maximum mana pool. MEN, equipment, and class passives raise it.',
    tags: ['derived', 'magical', 'vital'],
  },
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
    description: `Reduces incoming physical damage (melee, arrows). Damage taken ×${DEFENSE_HALF_REDUCTION}/(${DEFENSE_HALF_REDUCTION}+P.Def) — P.Def ${DEFENSE_HALF_REDUCTION} halves it, with diminishing returns above.`,
    tags: ['derived', 'defensive', 'physical'],
  },
  mDef: {
    id: 'mDef', short: 'M.Def', name: 'Magical Defense',
    description: `Reduces incoming magical damage (spells). Damage taken ×${DEFENSE_HALF_REDUCTION}/(${DEFENSE_HALF_REDUCTION}+M.Def) — M.Def ${DEFENSE_HALF_REDUCTION} halves it, with diminishing returns above.`,
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
    description: 'Lands your hits. DEX-driven, baseline 90. Each point above 90 cancels one point of the target\'s Evasion, so a dodge needs evasion to out-pace your accuracy.',
    tags: ['derived', 'offensive', 'physical'],
  },
  evasion: {
    id: 'evasion', short: 'Evd', name: 'Evasion',
    description: 'Dodges incoming attacks. DEX-driven, baseline 5. Each point above 5 is +1% dodge, reduced 1-for-1 by the attacker\'s Accuracy above 90, capped at 95%. Evade-style buffs add a separate flat dodge on top.',
    tags: ['derived', 'defensive', 'physical'],
  },
  attackSpeed: {
    id: 'attackSpeed', short: 'Atk Spd', name: 'Attack Speed',
    description: 'Swings per minute multiplier. DEX-driven; higher = faster auto-attack cadence.',
    tags: ['derived', 'offensive', 'physical'],
  },
  castSpeed: {
    id: 'castSpeed', short: 'Cast Spd', name: 'Cast Speed',
    description: 'Cast-rate multiplier (higher = faster). WIT-driven; +0.5%/WIT. Floor 1.0, ceiling 2.5.',
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
  dmgMult: {
    id: 'dmgMult', short: 'Dmg Mult', name: 'Damage Multiplier',
    description: 'Multiplier applied to every outgoing damage roll. Primary attribute, equipment, class passive, and Bless feed in.',
    tags: ['derived', 'offensive'],
  },
  critMult: {
    id: 'critMult', short: 'Crit ×', name: 'Critical Damage',
    description: 'Damage multiplier on a critical hit. WIT scales the bonus above the 1.6× baseline.',
    tags: ['derived', 'offensive'],
  },
};

